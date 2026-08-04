import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { getOpenAIModelForTier } from "@/lib/model-tier";
import {
  generateWordLensInterlinearMap,
  generateWordLensNotes
} from "@/lib/original-word-lens";
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
  writeWordLensCache
} from "@/lib/word-lens-cache";
import {
  parseMorphFields,
  transliterateToken
} from "@/lib/word-lens-deterministic";
import { resolveWordLensContext } from "@/lib/word-lens-data";
import { resolveActiveUserId } from "@/lib/session-user";
import { trackUsageSuccess } from "@/lib/usage-tracking";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  translation: z.enum(BIBLE_TRANSLATION_IDS).default(DEFAULT_BIBLE_TRANSLATION)
});

type WordLensPayload = {
  reference: string;
  chapterReference: string;
  translation: string;
  translationName: string;
  selectedVerse: { verse: number; text: string };
  sourceTranslation: string;
  sourceTranslationName: string;
  sourceText: string;
  rows: Array<{
    position: number;
    original: string;
    aiTranslation: string;
    transliteration: string;
    note: string;
    lemma: string | null;
    strong: string | null;
    strongNormalized: string | null;
    strongsDef: string;
    kjvDef: string;
    morph: string | null;
    partOfSpeech: string;
    type: string;
    gender: string;
    number: string;
    state: string;
    long: string;
  }>;
  notice: string | null;
  previousReference: string | null;
  nextReference: string | null;
};

type WordLensMapPayload = {
  reference: string;
  translation: string;
  translationName: string;
  selectedVerse: { verse: number; text: string };
  rows: Array<{ position: number; aiTranslation: string }>;
};

const NOTE_GRAMMAR_RE =
  /\b(?:noun|verb|adjective|adverb|pronoun|preposition|conjunction|article|participle|infinitive|morph|morphology|part of speech|grammar|grammatical|syntax|nominative|genitive|dative|accusative|vocative|aorist|imperfect|perfect|pluperfect|subjunctive|indicative|imperative|person|singular|plural|tense|voice|mood|case|gender|number|state)\b/i;
const NOTE_CODE_RE = /\b(?:Gr|He)[,:][A-Za-z0-9,:;-]+\b/;
const NOTE_VALUE_RE =
  /\b(?:can mean|also mean|often rendered|better rendered|not just|not merely|title|name|idiom|metaphor|wordplay|echo|alludes?|nuance|sense|range|emphasis)\b/i;

function sanitizeNoteRows(rows: Array<{ position: number; note: string }>) {
  const seen = new Set<string>();
  const cleaned: Array<{ position: number; note: string }> = [];

  for (const row of rows) {
    const note = row.note.replace(/\s+/g, " ").trim();
    if (note.length < 24 || note.length > 160) {
      continue;
    }
    if (NOTE_GRAMMAR_RE.test(note) || NOTE_CODE_RE.test(note)) {
      continue;
    }
    if (!NOTE_VALUE_RE.test(note)) {
      continue;
    }
    const dedupeKey = note.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    cleaned.push({ position: row.position, note });
  }

  return cleaned.slice(0, 1);
}

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

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/word-lens",
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

    const contextResult = await resolveWordLensContext(input);
    if (!contextResult.ok) {
      return NextResponse.json(
        { error: contextResult.error },
        { status: contextResult.status }
      );
    }

    const context = contextResult.data;
    const model = getOpenAIModelForTier(quotaDecision.tier);
    const promptVersion = getWordLensPromptVersion();
    const cacheKey = buildWordLensCacheKey({
      kind: "full",
      reference: context.reference,
      sourceTranslation: context.sourceTranslation,
      targetTranslation: context.translation,
      model,
      promptVersion
    });
    const mapCacheKey = buildWordLensCacheKey({
      kind: "map",
      reference: context.reference,
      sourceTranslation: context.sourceTranslation,
      targetTranslation: context.translation,
      model,
      promptVersion
    });

    const cached = await readWordLensCache<WordLensPayload>({ cacheKey });
    if (cached) {
      logEvent("info", "word_lens.cache_hit", {
        ...requestMeta,
        reference: context.reference
      });
      await trackUsageSuccess({
        request: req,
        feature: "WORD_LENS",
        pagePath: "/word-lens",
        apiRoute: "/api/word-lens",
        action: "analyze",
        userId,
        requestId
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
      lemma: string;
      translit: string | null;
      strongsDef: string | null;
      kjvDef: string | null;
    }> = [];
    if (strongCodes.length > 0) {
      try {
        lexiconRows = await prisma.bibleLexicon.findMany({
          where: { strong: { in: strongCodes } },
          select: {
            strong: true,
            lemma: true,
            translit: true,
            strongsDef: true,
            kjvDef: true
          }
        });
      } catch (error) {
        logEvent("warn", "word_lens.lexicon_lookup_failed", {
          ...requestMeta,
          reference: context.reference,
          error
        });
      }
    }
    const lexiconByStrong = new Map(lexiconRows.map((row) => [row.strong, row]));

    logEvent("info", "word_lens.ai_input", {
      ...requestMeta,
      reference: context.reference,
      sourceTranslation: context.sourceTranslation,
      sourceWordCount: context.sourceWords.length,
      targetTranslation: context.translation
    });

    const [mapResult, notesResult] = await Promise.allSettled([
      generateWordLensInterlinearMap({
        reference: context.reference,
        sourceTranslationName: context.sourceTranslationName,
        sourceVerseText: context.sourceText,
        targetTranslationName: context.translationName,
        targetVerseText: context.selectedVerse.text,
        words: context.sourceWords,
        model
      }),
      generateWordLensNotes({
        reference: context.reference,
        sourceTranslationName: context.sourceTranslationName,
        sourceVerseText: context.sourceText,
        targetTranslationName: context.translationName,
        targetVerseText: context.selectedVerse.text,
        words: context.sourceWords,
        model
      })
    ]);

    const mapRows = mapResult.status === "fulfilled" ? mapResult.value : [];
    const rawNoteRows = notesResult.status === "fulfilled" ? notesResult.value : [];
    const noteRows = sanitizeNoteRows(rawNoteRows);

    if (mapResult.status === "rejected") {
      logEvent("warn", "word_lens.map_fallback", {
        ...requestMeta,
        reference: context.reference,
        error: mapResult.reason
      });
    }
    if (notesResult.status === "rejected") {
      logEvent("warn", "word_lens.notes_fallback", {
        ...requestMeta,
        reference: context.reference,
        error: notesResult.reason
      });
    }

    const mapByPosition = new Map(mapRows.map((row) => [row.position, row]));
    const notesByPosition = new Map(noteRows.map((row) => [row.position, row]));

    const rows = context.sourceWords.map((word) => {
      const mapRow = mapByPosition.get(word.position);
      const noteRow = notesByPosition.get(word.position);
      const primaryStrong = extractStrongCandidates(word.strong)[0] ?? null;
      const lexicon = primaryStrong ? lexiconByStrong.get(primaryStrong) : null;
      const lexiconGloss = compactGloss(lexicon?.kjvDef ?? lexicon?.strongsDef ?? null);
      const morph = parseMorphFields({
        sourceTranslation: context.sourceTranslation,
        morph: word.morph
      });

      return {
        position: word.position,
        original: word.text,
        aiTranslation: mapRow?.aiTranslation?.trim() || lexiconGloss,
        transliteration: transliterateToken({
          sourceTranslation: context.sourceTranslation,
          tokenText: word.text,
          lemma: word.lemma,
          lexiconTranslit: lexicon?.translit
        }),
        note: noteRow?.note ?? "",
        lemma: word.lemma,
        strong: word.strong,
        strongNormalized: primaryStrong,
        strongsDef: lexicon?.strongsDef ?? "",
        kjvDef: lexicon?.kjvDef ?? "",
        morph: word.morph,
        partOfSpeech: morph.partOfSpeech,
        type: morph.type,
        gender: morph.gender,
        number: morph.number,
        state: morph.state,
        long: morph.long
      };
    });

    const payload: WordLensPayload = {
      reference: context.reference,
      chapterReference: context.chapterReference,
      translation: context.translation,
      translationName: context.translationName,
      selectedVerse: context.selectedVerse,
      sourceTranslation: context.sourceTranslation,
      sourceTranslationName: context.sourceTranslationName,
      sourceText: context.sourceText,
      rows,
      notice: context.notice,
      previousReference: context.previousReference,
      nextReference: context.nextReference
    };

    await writeWordLensCache({
      cacheKey,
      kind: "full",
      reference: context.reference,
      sourceTranslation: context.sourceTranslation,
      targetTranslation: context.translation,
      model,
      promptVersion,
      payload
    });

    const mapPayload: WordLensMapPayload = {
      reference: context.reference,
      translation: context.translation,
      translationName: context.translationName,
      selectedVerse: context.selectedVerse,
      rows: rows.map((row) => ({
        position: row.position,
        aiTranslation: row.aiTranslation
      }))
    };
    await writeWordLensCache({
      cacheKey: mapCacheKey,
      kind: "map",
      reference: context.reference,
      sourceTranslation: context.sourceTranslation,
      targetTranslation: context.translation,
      model,
      promptVersion,
      payload: mapPayload
    });

    logEvent("info", "word_lens.ai_output", {
      ...requestMeta,
      reference: context.reference,
      mapRowsCount: mapRows.length,
      noteRowsCount: noteRows.length,
      finalRowsCount: rows.length
    });

    await trackUsageSuccess({
      request: req,
      feature: "WORD_LENS",
      pagePath: "/word-lens",
      apiRoute: "/api/word-lens",
      action: "analyze",
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
        { error: "Invalid word-lens request." },
        { status: 400 }
      );
    }
    if (isPrismaDatabaseUnavailableError(error)) {
      logEvent("warn", "word_lens.database_unavailable", { ...requestMeta, error });
      return NextResponse.json(
        { error: "Database temporarily unavailable. Please retry in a moment." },
        { status: 503 }
      );
    }
    captureServerException(error, {
      route: "/api/word-lens",
      requestId
    });
    logEvent("error", "word_lens.failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to build word lens right now." },
      { status: 500 }
    );
  }
}
