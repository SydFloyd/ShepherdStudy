import {
  BibleSourceInfo,
  getLocalBibleVersion,
  isOldTestamentBook,
  resolveBibleBookCandidates,
  toBibleSourceInfo
} from "@/lib/bible";
import {
  resolvePassageFromBible
} from "@/lib/bible-provider";
import {
  formatResolvedReference,
  getOriginalLanguageSnapshot
} from "@/lib/local-bible";
import { parseScriptureReference } from "@/lib/scripture";

export type WordLensResolvedContext = {
  reference: string;
  chapterReference: string;
  translation: string;
  translationName: string;
  targetSource: BibleSourceInfo;
  selectedVerse: {
    verse: number;
    text: string;
  };
  sourceTranslation: string;
  sourceTranslationName: string;
  originalSource: BibleSourceInfo;
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

export function getWordLensCacheCoordinates(input: {
  reference: string;
  translation: string;
}): {
  reference: string;
  sourceTranslation: "uhb" | "ugnt";
  targetTranslation: string;
} | null {
  const parsed = parseScriptureReference(input.reference);
  if (!parsed) {
    return null;
  }

  const candidates = resolveBibleBookCandidates(parsed.book);
  const testamentFlags = new Set(
    candidates
      .map((book) => isOldTestamentBook(book))
      .filter((value): value is boolean => value !== null)
  );
  if (candidates.length === 0 || testamentFlags.size !== 1) {
    return null;
  }
  const isOt = testamentFlags.values().next().value as boolean;
  const requestBookKey = parsed.book.toLowerCase().replace(/[^a-z0-9]/g, "");

  return {
    reference: `request:${requestBookKey} ${parsed.chapter}:${
      parsed.verseStart ?? 1
    }`,
    sourceTranslation: isOt ? "uhb" : "ugnt",
    targetTranslation: input.translation
  };
}

export async function resolveWordLensContext(input: {
  reference: string;
  translation: string;
}): Promise<WordLensContextResult> {
  const resolution = await resolvePassageFromBible({
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
  const originalVersion = getLocalBibleVersion(original.sourceTranslation);
  if (!originalVersion) {
    return {
      ok: false,
      status: 404,
      error: "Original language edition metadata is unavailable."
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
  const notices = [
    rangeRequested
      ? `Showing ${resolvedReference} from your selection.`
      : null,
    resolution.source.provider === "dbs"
      ? "The local Hebrew or Greek source is aligned by chapter and verse number; editions with alternate versification may differ."
      : null
  ].filter((value): value is string => Boolean(value));
  const notice = notices.length > 0 ? notices.join(" ") : null;

  return {
    ok: true,
    data: {
      reference: resolvedReference,
      chapterReference: resolution.chapterReference,
      translation: resolution.source.translation,
      translationName: resolution.translationName,
      targetSource: resolution.source,
      selectedVerse: {
        verse: selectedVerse.verse,
        text: selectedVerse.text
      },
      sourceTranslation: original.sourceTranslation,
      sourceTranslationName: original.sourceTranslationName,
      originalSource: toBibleSourceInfo(originalVersion),
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
