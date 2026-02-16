import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { getRequestMeta, logEvent } from "@/lib/logger";
import {
  generateWordLensInterlinearMap,
  generateWordLensMorphology,
  generateWordLensNotes,
  generateWordLensTransliterations
} from "@/lib/original-word-lens";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { extractStrongCandidates } from "@/lib/strongs";
import { resolveWordLensContext } from "@/lib/word-lens-data";
import { prisma } from "@/lib/prisma";
import { consumeQuota } from "@/lib/quota";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  translation: z.enum(BIBLE_TRANSLATION_IDS).default(DEFAULT_BIBLE_TRANSLATION)
});

function stripDiacritics(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function stripHebrewMarks(input: string) {
  return input.replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, "");
}

function transliterateGreek(input: string) {
  const map: Record<string, string> = {
    "\u03b1": "a",
    "\u03b2": "b",
    "\u03b3": "g",
    "\u03b4": "d",
    "\u03b5": "e",
    "\u03b6": "z",
    "\u03b7": "e",
    "\u03b8": "th",
    "\u03b9": "i",
    "\u03ba": "k",
    "\u03bb": "l",
    "\u03bc": "m",
    "\u03bd": "n",
    "\u03be": "x",
    "\u03bf": "o",
    "\u03c0": "p",
    "\u03c1": "r",
    "\u03c3": "s",
    "\u03c2": "s",
    "\u03c4": "t",
    "\u03c5": "u",
    "\u03c6": "ph",
    "\u03c7": "ch",
    "\u03c8": "ps",
    "\u03c9": "o"
  };

  const normalized = stripDiacritics(input).toLowerCase();
  let out = "";
  for (const char of normalized) {
    if (char === " ") {
      out += " ";
      continue;
    }
    out += map[char] ?? char;
  }
  return out.trim();
}

function transliterateHebrew(input: string) {
  const map: Record<string, string> = {
    "\u05d0": "a",
    "\u05d1": "b",
    "\u05d2": "g",
    "\u05d3": "d",
    "\u05d4": "h",
    "\u05d5": "v",
    "\u05d6": "z",
    "\u05d7": "ch",
    "\u05d8": "t",
    "\u05d9": "y",
    "\u05db": "k",
    "\u05da": "k",
    "\u05dc": "l",
    "\u05de": "m",
    "\u05dd": "m",
    "\u05e0": "n",
    "\u05df": "n",
    "\u05e1": "s",
    "\u05e2": "a",
    "\u05e4": "p",
    "\u05e3": "p",
    "\u05e6": "ts",
    "\u05e5": "ts",
    "\u05e7": "q",
    "\u05e8": "r",
    "\u05e9": "sh",
    "\u05ea": "t"
  };

  const normalized = stripHebrewMarks(input);
  let out = "";
  for (const char of normalized) {
    if (char === " ") {
      out += " ";
      continue;
    }
    out += map[char] ?? "";
  }
  return out.trim();
}

function transliterateToken(input: {
  sourceTranslation: string;
  tokenText: string;
  lemma: string | null;
}) {
  const source = input.sourceTranslation;
  const sourceText = input.tokenText.trim();
  const sourceLemma = input.lemma?.trim() ?? "";
  const value = sourceLemma || sourceText;

  if (!value) {
    return "";
  }

  if (source === "ugnt") {
    return transliterateGreek(value);
  }
  if (source === "uhb") {
    return transliterateHebrew(value);
  }
  return value;
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

    const [mapResult, translitResult, notesResult, morphologyResult] =
      await Promise.allSettled([
        generateWordLensInterlinearMap({
          reference: context.reference,
          sourceTranslationName: context.sourceTranslationName,
          sourceVerseText: context.sourceText,
          targetTranslationName: context.translationName,
          targetVerseText: context.selectedVerse.text,
          words: context.sourceWords
        }),
        generateWordLensTransliterations({
          reference: context.reference,
          sourceTranslationName: context.sourceTranslationName,
          words: context.sourceWords
        }),
        generateWordLensNotes({
          reference: context.reference,
          sourceTranslationName: context.sourceTranslationName,
          sourceVerseText: context.sourceText,
          targetTranslationName: context.translationName,
          targetVerseText: context.selectedVerse.text,
          words: context.sourceWords
        }),
        generateWordLensMorphology({
          reference: context.reference,
          sourceTranslationName: context.sourceTranslationName,
          words: context.sourceWords
        })
      ]);

    const mapRows = mapResult.status === "fulfilled" ? mapResult.value : [];
    const transliterationRows =
      translitResult.status === "fulfilled" ? translitResult.value : [];
    const noteRows = notesResult.status === "fulfilled" ? notesResult.value : [];
    const morphologyRows =
      morphologyResult.status === "fulfilled" ? morphologyResult.value : [];

    if (mapResult.status === "rejected") {
      logEvent("warn", "word_lens.map_fallback", {
        ...requestMeta,
        reference: context.reference,
        error: mapResult.reason
      });
    }
    if (translitResult.status === "rejected") {
      logEvent("warn", "word_lens.transliteration_fallback", {
        ...requestMeta,
        reference: context.reference,
        error: translitResult.reason
      });
    }
    if (notesResult.status === "rejected") {
      logEvent("warn", "word_lens.notes_fallback", {
        ...requestMeta,
        reference: context.reference,
        error: notesResult.reason
      });
    }
    if (morphologyResult.status === "rejected") {
      logEvent("warn", "word_lens.morphology_fallback", {
        ...requestMeta,
        reference: context.reference,
        error: morphologyResult.reason
      });
    }

    const mapByPosition = new Map(mapRows.map((row) => [row.position, row]));
    const transliterationByPosition = new Map(
      transliterationRows.map((row) => [row.position, row])
    );
    const notesByPosition = new Map(noteRows.map((row) => [row.position, row]));
    const morphologyByPosition = new Map(
      morphologyRows.map((row) => [row.position, row])
    );

    const missingMap = context.sourceWords.filter((word) => {
      const row = mapByPosition.get(word.position);
      return !row?.aiTranslation?.trim();
    });
    const missingTransliteration = context.sourceWords.filter((word) => {
      const row = transliterationByPosition.get(word.position);
      return !row?.transliteration?.trim();
    });

    if (missingMap.length > 0 || missingTransliteration.length > 0) {
      logEvent("warn", "word_lens.ai_missing_fields", {
        ...requestMeta,
        reference: context.reference,
        missingMapCount: missingMap.length,
        missingTransliterationCount: missingTransliteration.length,
        missingMapPositions: missingMap.slice(0, 20).map((word) => word.position),
        missingTransliterationPositions: missingTransliteration
          .slice(0, 20)
          .map((word) => word.position)
      });
    }

    const rows = context.sourceWords.map((word) => {
      const mapRow = mapByPosition.get(word.position);
      const translitRow = transliterationByPosition.get(word.position);
      const noteRow = notesByPosition.get(word.position);
      const morphRow = morphologyByPosition.get(word.position);
      const primaryStrong = extractStrongCandidates(word.strong)[0] ?? null;
      const lexicon = primaryStrong ? lexiconByStrong.get(primaryStrong) : null;
      const lexiconGloss = compactGloss(lexicon?.kjvDef ?? lexicon?.strongsDef ?? null);

      return {
        position: word.position,
        original: word.text,
        aiTranslation: mapRow?.aiTranslation?.trim() || lexiconGloss,
        transliteration:
          translitRow?.transliteration?.trim() ||
          lexicon?.translit ||
          transliterateToken({
            sourceTranslation: context.sourceTranslation,
            tokenText: word.text,
            lemma: word.lemma
          }),
        note: noteRow?.note ?? "",
        lemma: word.lemma,
        strong: word.strong,
        strongNormalized: primaryStrong,
        strongsDef: lexicon?.strongsDef ?? "",
        kjvDef: lexicon?.kjvDef ?? "",
        morph: word.morph,
        partOfSpeech: morphRow?.partOfSpeech ?? "",
        type: morphRow?.type ?? "",
        gender: morphRow?.gender ?? "",
        number: morphRow?.number ?? "",
        state: morphRow?.state ?? "",
        long: morphRow?.long ?? ""
      };
    });

    logEvent("info", "word_lens.ai_output", {
      ...requestMeta,
      reference: context.reference,
      mapRowsCount: mapRows.length,
      transliterationRowsCount: transliterationRows.length,
      noteRowsCount: noteRows.length,
      morphologyRowsCount: morphologyRows.length,
      finalRowsCount: rows.length
    });

    return NextResponse.json({
      reference: context.reference,
      chapterReference: context.chapterReference,
      translation: context.translation,
      translationName: context.translationName,
      selectedVerse: context.selectedVerse,
      sourceTranslation: context.sourceTranslation,
      sourceTranslationName: context.sourceTranslationName,
      sourceText: context.sourceText,
      quota: quotaDecision,
      rows,
      notice: context.notice,
      previousReference: context.previousReference,
      nextReference: context.nextReference
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid word-lens request." },
        { status: 400 }
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
