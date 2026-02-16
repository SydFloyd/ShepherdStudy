import {
  formatResolvedReference,
  getOriginalLanguageSnapshot,
  resolvePassageFromLocalBible
} from "@/lib/local-bible";

export type WordLensResolvedContext = {
  reference: string;
  chapterReference: string;
  translation: string;
  translationName: string;
  selectedVerse: {
    verse: number;
    text: string;
  };
  sourceTranslation: string;
  sourceTranslationName: string;
  sourceText: string;
  sourceWords: Array<{
    position: number;
    text: string;
    lemma: string | null;
    strong: string | null;
    morph: string | null;
  }>;
  notice: string | null;
  previousReference: string | null;
  nextReference: string | null;
};

export type WordLensContextResult =
  | {
      ok: true;
      data: WordLensResolvedContext;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function resolveWordLensContext(input: {
  reference: string;
  translation: string;
}): Promise<WordLensContextResult> {
  const resolution = await resolvePassageFromLocalBible({
    reference: input.reference,
    translation: input.translation
  });

  if (!resolution.ok) {
    return {
      ok: false,
      status: resolution.reason === "invalid_reference" ? 400 : 404,
      error: resolution.message
    };
  }

  const defaultToFirstVerse = !resolution.parsed.verseStart;
  const selectedVerseNumber =
    resolution.selectedVerses[0]?.verse ?? resolution.chapterVerses[0]?.verse;

  if (!selectedVerseNumber) {
    return { ok: false, status: 404, error: "Unable to resolve verse." };
  }

  const selectedVerse = resolution.chapterVerses.find(
    (verse) => verse.verse === selectedVerseNumber
  );
  if (!selectedVerse) {
    return { ok: false, status: 404, error: "Unable to resolve verse." };
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
    return {
      ok: false,
      status: 404,
      error: "Original language data unavailable for this verse."
    };
  }

  const sourceVerse = original.verses.find(
    (verse) => verse.verse === selectedVerseNumber
  );
  if (!sourceVerse) {
    return {
      ok: false,
      status: 404,
      error: "Original language data unavailable for this verse."
    };
  }

  const chapterIndex = resolution.chapterVerses.findIndex(
    (verse) => verse.verse === selectedVerseNumber
  );
  const previousVerse =
    chapterIndex > 0 ? resolution.chapterVerses[chapterIndex - 1] : null;
  const nextVerse =
    chapterIndex >= 0 && chapterIndex < resolution.chapterVerses.length - 1
      ? resolution.chapterVerses[chapterIndex + 1]
      : null;

  const rangeRequested =
    defaultToFirstVerse || Boolean(resolution.parsed.verseEnd);
  const notice = rangeRequested
    ? `Showing ${resolvedReference} from your selection.`
    : null;

  return {
    ok: true,
    data: {
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
      sourceWords: sourceVerse.words,
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
    }
  };
}
