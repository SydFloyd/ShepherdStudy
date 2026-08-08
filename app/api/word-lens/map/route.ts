import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import {
  BibleSourceInfo,
  bibleTranslationIdSchema,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import {
  BibleProviderError,
  bibleProviderErrorResponse
} from "@/lib/bible-provider-error";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { getOpenAIModelForTier } from "@/lib/model-tier";
import { generateWordLensInterlinearMap } from "@/lib/original-word-lens";
import { prisma } from "@/lib/prisma";
import { consumeQuota } from "@/lib/quota";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/request-body";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { isPrismaDatabaseUnavailableError } from "@/lib/prisma-errors";
import { extractStrongCandidates } from "@/lib/strongs";
import {
  buildWordLensCacheKey,
  getWordLensPromptVersion,
  readWordLensCache,
  writeWordLensCache,
  writeWordLensCacheAlias
} from "@/lib/word-lens-cache";
import {
  getWordLensCacheCoordinates,
  resolveWordLensContext
} from "@/lib/word-lens-data";
import { resolveActiveUserId } from "@/lib/session-user";
import { trackUsageSuccess } from "@/lib/usage-tracking";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  translation: bibleTranslationIdSchema.default(DEFAULT_BIBLE_TRANSLATION)
});

function compactGloss(input: string | null | undefined) {
  if (!input) {
    return "";
  }
  const first = input
    .replace(/\s+/g, " ")
    .split(/[;,.]/)[0]
    ?.trim();
  return first ?? "";
}

type MapPayload = {
  reference: string;
  translation: string;
  translationName: string;
  targetSource: BibleSourceInfo;
  selectedVerse: { verse: number; text: string };
  rows: Array<{ position: number; aiTranslation: string }>;
};

function withoutLicensedTargetText(payload: MapPayload): MapPayload {
  return payload.targetSource.provider === "esv"
    ? {
        ...payload,
        selectedVerse: { ...payload.selectedVerse, text: "" }
      }
    : payload;
}

async function hydrateCachedPayload(
  payload: MapPayload,
  input: z.infer<typeof inputSchema>
) {
  if (payload.targetSource.provider !== "esv" || payload.selectedVerse.text) {
    return payload;
  }
  const context = await resolveWordLensContext(input);
  if (!context.ok) {
    throw new BibleProviderError(
      context.error,
      "esv",
      "not_found",
      context.status
    );
  }
  return {
    ...payload,
    targetSource: context.data.targetSource,
    selectedVerse: context.data.selectedVerse
  };
}

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/word-lens/map",
    method: req.method
  });

  try {
    const input = inputSchema.parse(await readJsonBody(req));
    const session = await getServerSession(authOptions);
    const userId = await resolveActiveUserId(session?.user?.id);
    const quotaDecision = await consumeQuota({
      request: req,
      userId,
      feature: "INTERLINEAR"
    });
    if (!quotaDecision.allowed) {
      return NextResponse.json(
        {
          error:
            quotaDecision.reason === "daily_limit"
              ? "Daily interlinear limit reached. Please try again tomorrow."
              : "Too many interlinear requests in a short period. Please wait and retry.",
          quota: quotaDecision
        },
        {
          status: 429,
          headers: { "Retry-After": String(quotaDecision.retryAfterSeconds) }
        }
      );
    }

    const model = getOpenAIModelForTier(quotaDecision.tier);
    const promptVersion = getWordLensPromptVersion();
    const requestCacheCoordinates = getWordLensCacheCoordinates(input);
    const requestCacheKey = requestCacheCoordinates
      ? buildWordLensCacheKey({
          kind: "map",
          ...requestCacheCoordinates,
          model,
          promptVersion
        })
      : null;
    const cached = requestCacheKey
      ? await readWordLensCache<MapPayload>({ cacheKey: requestCacheKey })
      : null;
    if (cached) {
      const hydratedCached = await hydrateCachedPayload(cached, input);
      logEvent("info", "word_lens.map_cache_hit", {
        ...requestMeta,
        reference: requestCacheCoordinates?.reference
      });
      await trackUsageSuccess({
        request: req,
        feature: "WORD_LENS",
        pagePath: "/word-lens",
        apiRoute: "/api/word-lens/map",
        action: "translation_map",
        userId,
        requestId
      });
      return NextResponse.json({
        ...hydratedCached,
        quota: quotaDecision,
        cached: true
      });
    }

    const contextResult = await resolveWordLensContext(input);
    if (!contextResult.ok) {
      return NextResponse.json(
        { error: contextResult.error },
        { status: contextResult.status }
      );
    }

    const context = contextResult.data;
    const cacheKey = buildWordLensCacheKey({
      kind: "map",
      reference: context.reference,
      sourceTranslation: context.sourceTranslation,
      targetTranslation: context.translation,
      model,
      promptVersion
    });
    if (cacheKey !== requestCacheKey) {
      const canonicalCached = await readWordLensCache<MapPayload>({ cacheKey });
      if (canonicalCached) {
        if (requestCacheKey) {
          await writeWordLensCacheAlias({
            cacheKey: requestCacheKey,
            canonicalCacheKey: cacheKey,
            kind: "map",
            reference: context.reference,
            sourceTranslation: context.sourceTranslation,
            targetTranslation: context.translation,
            model,
            promptVersion
          });
        }
        logEvent("info", "word_lens.map_canonical_cache_hit", {
          ...requestMeta,
          reference: context.reference
        });
        await trackUsageSuccess({
          request: req,
          feature: "WORD_LENS",
          pagePath: "/word-lens",
          apiRoute: "/api/word-lens/map",
          action: "translation_map",
          userId,
          requestId
        });
        return NextResponse.json({
          ...canonicalCached,
          targetSource: context.targetSource,
          selectedVerse: context.selectedVerse,
          quota: quotaDecision,
          cached: true
        });
      }
    }

    const strongCodes = Array.from(
      new Set(
        context.sourceWords
          .flatMap((word) => extractStrongCandidates(word.strong))
          .filter((code) => code.length > 0)
      )
    );
    let lexiconRows: Array<{
      strong: string;
      strongsDef: string | null;
      kjvDef: string | null;
    }> = [];
    if (strongCodes.length > 0) {
      try {
        lexiconRows = await prisma.bibleLexicon.findMany({
          where: { strong: { in: strongCodes } },
          select: {
            strong: true,
            strongsDef: true,
            kjvDef: true
          }
        });
      } catch (error) {
        logEvent("warn", "word_lens.map_only_lexicon_lookup_failed", {
          ...requestMeta,
          reference: context.reference,
          error
        });
      }
    }
    const lexiconByStrong = new Map(lexiconRows.map((row) => [row.strong, row]));

    let mapRows = [] as Array<{ position: number; aiTranslation: string }>;
    try {
      mapRows = await generateWordLensInterlinearMap({
        reference: context.reference,
        sourceTranslationName: context.sourceTranslationName,
        sourceVerseText: context.sourceText,
        targetTranslationName: context.translationName,
        targetVerseText: context.selectedVerse.text,
        words: context.sourceWords,
        model
      });
    } catch (error) {
      logEvent("warn", "word_lens.map_only_fallback", {
        ...requestMeta,
        reference: context.reference,
        error
      });
    }

    const mapByPosition = new Map(mapRows.map((row) => [row.position, row]));
    const rows = context.sourceWords.map((word) => {
      const primaryStrong = extractStrongCandidates(word.strong)[0] ?? null;
      const lexicon = primaryStrong ? lexiconByStrong.get(primaryStrong) : null;
      return {
        position: word.position,
        aiTranslation:
          mapByPosition.get(word.position)?.aiTranslation?.trim() ||
          compactGloss(lexicon?.kjvDef ?? lexicon?.strongsDef ?? null)
      };
    });

    const payload: MapPayload = {
      reference: context.reference,
      translation: context.translation,
      translationName: context.translationName,
      targetSource: context.targetSource,
      selectedVerse: context.selectedVerse,
      rows
    };

    await writeWordLensCache({
      cacheKey,
      kind: "map",
      reference: context.reference,
      sourceTranslation: context.sourceTranslation,
      targetTranslation: context.translation,
      model,
      promptVersion,
      payload: withoutLicensedTargetText(payload)
    });
    if (requestCacheKey && requestCacheKey !== cacheKey) {
      await writeWordLensCacheAlias({
        cacheKey: requestCacheKey,
        canonicalCacheKey: cacheKey,
        kind: "map",
        reference: context.reference,
        sourceTranslation: context.sourceTranslation,
        targetTranslation: context.translation,
        model,
        promptVersion
      });
    }

    logEvent("info", "word_lens.map_only_ok", {
      ...requestMeta,
      reference: context.reference,
      translation: context.translation,
      rows: rows.length
    });

    await trackUsageSuccess({
      request: req,
      feature: "WORD_LENS",
      pagePath: "/word-lens",
      apiRoute: "/api/word-lens/map",
      action: "translation_map",
      userId,
      requestId
    });

    return NextResponse.json({
      ...payload,
      quota: quotaDecision,
      cached: false
    });
  } catch (error) {
    const bodyErrorResponse = requestBodyErrorResponse(error);
    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid interlinear map request." },
        { status: 400 }
      );
    }
    if (error instanceof BibleProviderError) {
      return bibleProviderErrorResponse(error);
    }
    if (isPrismaDatabaseUnavailableError(error)) {
      logEvent("warn", "word_lens.map_only_database_unavailable", {
        ...requestMeta,
        error
      });
      return NextResponse.json(
        { error: "Database temporarily unavailable. Please retry in a moment." },
        { status: 503 }
      );
    }
    captureServerException(error, {
      route: "/api/word-lens/map",
      requestId
    });
    logEvent("error", "word_lens.map_only_failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to update interlinear map right now." },
      { status: 500 }
    );
  }
}
