import { NextResponse } from "next/server";
import { z } from "zod";

import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import {
  formatResolvedReference,
  getOriginalLanguageSnapshot,
  resolvePassageFromLocalBible
} from "@/lib/local-bible";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { generateOriginalWordLensRows } from "@/lib/original-word-lens";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  translation: z.enum(BIBLE_TRANSLATION_IDS).default(DEFAULT_BIBLE_TRANSLATION)
});

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/word-lens",
    method: req.method
  });

  try {
    const input = inputSchema.parse(await req.json());
    const resolution = await resolvePassageFromLocalBible({
      reference: input.reference,
      translation: input.translation
    });

    if (!resolution.ok) {
      return NextResponse.json(
        { error: resolution.message },
        { status: resolution.reason === "invalid_reference" ? 400 : 404 }
      );
    }

    const defaultToFirstVerse = !resolution.parsed.verseStart;
    const selectedVerseNumber =
      resolution.selectedVerses[0]?.verse ?? resolution.chapterVerses[0]?.verse;

    if (!selectedVerseNumber) {
      return NextResponse.json(
        { error: "Unable to resolve verse." },
        { status: 404 }
      );
    }

    const selectedVerse = resolution.chapterVerses.find(
      (verse) => verse.verse === selectedVerseNumber
    );
    if (!selectedVerse) {
      return NextResponse.json(
        { error: "Unable to resolve verse." },
        { status: 404 }
      );
    }

    const resolvedReference = formatResolvedReference(resolution.resolvedBook, {
      book: resolution.resolvedBook,
      chapter: resolution.parsed.chapter,
      verseStart: selectedVerseNumber
    });

    const original = await getOriginalLanguageSnapshot({
      chapterReference: resolution.chapterReference,
      verses: [selectedVerse]
    });

    if (!original) {
      return NextResponse.json(
        { error: "Original language data unavailable for this verse." },
        { status: 404 }
      );
    }

    const sourceVerse = original.verses.find(
      (verse) => verse.verse === selectedVerseNumber
    );
    if (!sourceVerse) {
      return NextResponse.json(
        { error: "Original language data unavailable for this verse." },
        { status: 404 }
      );
    }

    const chapterIndex = resolution.chapterVerses.findIndex(
      (verse) => verse.verse === selectedVerseNumber
    );

    const previousVerse = chapterIndex > 0 ? resolution.chapterVerses[chapterIndex - 1] : null;
    const nextVerse =
      chapterIndex >= 0 && chapterIndex < resolution.chapterVerses.length - 1
        ? resolution.chapterVerses[chapterIndex + 1]
        : null;

    let aiRows = [] as Awaited<ReturnType<typeof generateOriginalWordLensRows>>;
    try {
      aiRows = await generateOriginalWordLensRows({
        reference: resolvedReference,
        sourceTranslationName: original.sourceTranslationName,
        sourceVerseText: sourceVerse.text,
        words: sourceVerse.words
      });
    } catch (error) {
      logEvent("warn", "word_lens.ai_fallback", { ...requestMeta, error });
    }

    const aiByPosition = new Map(aiRows.map((row) => [row.position, row]));
    const rows = sourceVerse.words.map((word) => {
      const ai = aiByPosition.get(word.position);
      return {
        position: word.position,
        original: word.text,
        aiTranslation: ai?.aiTranslation ?? "",
        transliteration: ai?.transliteration ?? "",
        note: ai?.note ?? "",
        lemma: word.lemma,
        strong: word.strong,
        morph: word.morph,
        partOfSpeech: ai?.partOfSpeech ?? "",
        type: ai?.type ?? "",
        gender: ai?.gender ?? "",
        number: ai?.number ?? "",
        state: ai?.state ?? "",
        long: ai?.long ?? ""
      };
    });

    const rangeRequested =
      defaultToFirstVerse || Boolean(resolution.parsed.verseEnd);
    const notice = rangeRequested
      ? `Showing ${resolvedReference} from your selection.`
      : null;

    logEvent("info", "word_lens.ok", {
      ...requestMeta,
      reference: resolvedReference,
      rowCount: rows.length
    });

    return NextResponse.json({
      reference: resolvedReference,
      chapterReference: resolution.chapterReference,
      translation: input.translation,
      translationName: resolution.translationName,
      selectedVerse: {
        verse: selectedVerse.verse,
        text: selectedVerse.text
      },
      sourceTranslation: original.sourceTranslation,
      sourceTranslationName: original.sourceTranslationName,
      sourceText: sourceVerse.text,
      rows,
      notice,
      previousReference: previousVerse
        ? formatResolvedReference(resolution.resolvedBook, {
            book: resolution.resolvedBook,
            chapter: resolution.parsed.chapter,
            verseStart: previousVerse.verse
          })
        : null,
      nextReference: nextVerse
        ? formatResolvedReference(resolution.resolvedBook, {
            book: resolution.resolvedBook,
            chapter: resolution.parsed.chapter,
            verseStart: nextVerse.verse
          })
        : null
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
