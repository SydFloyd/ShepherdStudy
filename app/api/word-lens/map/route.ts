import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { generateWordLensInterlinearMap } from "@/lib/original-word-lens";
import { prisma } from "@/lib/prisma";
import { consumeQuota } from "@/lib/quota";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { extractStrongCandidates } from "@/lib/strongs";
import {
  buildWordLensCacheKey,
  getWordLensPromptVersion,
  readWordLensCache,
  writeWordLensCache
} from "@/lib/word-lens-cache";
import { resolveWordLensContext } from "@/lib/word-lens-data";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  translation: z.enum(BIBLE_TRANSLATION_IDS).default(DEFAULT_BIBLE_TRANSLATION)
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
  selectedVerse: { verse: number; text: string };
  rows: Array<{ position: number; aiTranslation: string }>;
};

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/word-lens/map",
    method: req.method
  });

  try {
    const input = inputSchema.parse(await req.json());
    const session = await getServerSession(authOptions);
    const quotaDecision = await consumeQuota({
      request: req,
      userId: session?.user?.id,
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

    const contextResult = await resolveWordLensContext(input);
    if (!contextResult.ok) {
      return NextResponse.json(
        { error: contextResult.error },
        { status: contextResult.status }
      );
    }

    const context = contextResult.data;
    const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
    const promptVersion = getWordLensPromptVersion();
    const cacheKey = buildWordLensCacheKey({
      kind: "map",
      reference: context.reference,
      sourceTranslation: context.sourceTranslation,
      targetTranslation: context.translation,
      model,
      promptVersion
    });

    const cached = await readWordLensCache<MapPayload>({ cacheKey });
    if (cached) {
      logEvent("info", "word_lens.map_cache_hit", {
        ...requestMeta,
        reference: context.reference
      });
      return NextResponse.json({
        ...cached,
        quota: quotaDecision,
        cached: true
      });
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
        words: context.sourceWords
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
      payload
    });

    logEvent("info", "word_lens.map_only_ok", {
      ...requestMeta,
      reference: context.reference,
      translation: context.translation,
      rows: rows.length
    });

    return NextResponse.json({
      ...payload,
      quota: quotaDecision,
      cached: false
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid interlinear map request." },
        { status: 400 }
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
