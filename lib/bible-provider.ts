import {
  getLocalBibleVersion,
  isDbsTranslation,
  resolveBibleBookCandidates,
  toBibleSourceInfo
} from "@/lib/bible";
import {
  getDbsBibleChapter,
  getDbsBookId,
  DbsBibleError
} from "@/lib/dbs-bible";
import {
  formatResolvedReference,
  getChapterFromLocalBible,
  PassageResolutionResult,
  resolvePassageFromLocalBible
} from "@/lib/local-bible";
import {
  buildPassagePath,
  ParsedReference,
  parseScriptureReference
} from "@/lib/scripture";
import type { PassageVerse, StudyPassageResult } from "@/lib/study-contract";

import { getBibleVersion } from "@/lib/bible-catalog";

export { getBibleCatalog, getBibleVersion } from "@/lib/bible-catalog";

function uniqueDbsBookCandidates(book: string) {
  return Array.from(
    new Set([book, ...resolveBibleBookCandidates(book)])
  ).filter((candidate) => Boolean(getDbsBookId(candidate)));
}

function withEmptyNotes(
  verses: Array<{ verse: number; paragraph: number; text: string }>
): PassageVerse[] {
  return verses.map((verse) => ({ ...verse, notes: [] }));
}

function selectVerses(verses: PassageVerse[], parsed: ParsedReference) {
  if (!parsed.verseStart) {
    return verses;
  }
  const end = parsed.verseEnd ?? parsed.verseStart;
  return verses.filter(
    (verse) => verse.verse >= parsed.verseStart! && verse.verse <= end
  );
}

async function loadDbsCandidateChapter(input: {
  translation: string;
  book: string;
  chapter: number;
}): Promise<{ book: string; verses: PassageVerse[] } | null> {
  for (const candidate of uniqueDbsBookCandidates(input.book)) {
    try {
      const verses = withEmptyNotes(
        await getDbsBibleChapter({
          translation: input.translation,
          book: candidate,
          chapter: input.chapter
        })
      );
      if (verses.length > 0) {
        return { book: candidate, verses };
      }
    } catch (error) {
      if (error instanceof DbsBibleError && error.code === "not_found") {
        continue;
      }
      throw error;
    }
  }
  return null;
}

async function resolvePassageFromDbs(input: {
  reference: string;
  translation: string;
}): Promise<PassageResolutionResult> {
  const parsed = parseScriptureReference(input.reference);
  if (!parsed) {
    return {
      ok: false,
      reason: "invalid_reference",
      message: "Invalid passage format. Example: Matthew 6:25-34"
    };
  }

  const version = await getBibleVersion(input.translation);
  if (!version || version.provider !== "dbs") {
    return {
      ok: false,
      reason: "not_found",
      message: "That Digital Bible Society translation is not available.",
      parsed
    };
  }

  const chapter = await loadDbsCandidateChapter({
    translation: version.value,
    book: parsed.book,
    chapter: parsed.chapter
  });
  if (!chapter) {
    return {
      ok: false,
      reason: "not_found",
      message: "Passage not found in this Bible translation.",
      parsed,
      bookCandidates: uniqueDbsBookCandidates(parsed.book)
    };
  }

  const selectedVerses = selectVerses(chapter.verses, parsed);
  const requestedEnd = parsed.verseEnd ?? parsed.verseStart;
  if (
    parsed.verseStart &&
    (selectedVerses[0]?.verse !== parsed.verseStart ||
      selectedVerses[selectedVerses.length - 1]?.verse !== requestedEnd ||
      selectedVerses.length !== requestedEnd - parsed.verseStart + 1)
  ) {
    return {
      ok: false,
      reason: "not_found",
      message: "One or more verses in that range do not exist.",
      parsed,
      bookCandidates: [chapter.book]
    };
  }

  const resolvedReference = formatResolvedReference(chapter.book, parsed);
  return {
    ok: true,
    parsed,
    resolvedBook: chapter.book,
    resolvedReference,
    chapterVerses: chapter.verses,
    selectedVerses,
    chapterReference: `${chapter.book} ${parsed.chapter}`,
    chapterPath: buildPassagePath(resolvedReference, version.value),
    translationName: version.title,
    source: toBibleSourceInfo(version)
  };
}

export async function resolveBiblePassage(input: {
  reference: string;
  translation: string;
}): Promise<PassageResolutionResult> {
  if (getLocalBibleVersion(input.translation)) {
    return resolvePassageFromLocalBible(input);
  }
  if (isDbsTranslation(input.translation)) {
    return resolvePassageFromDbs(input);
  }
  return {
    ok: false,
    reason: "not_found",
    message: "That Bible translation is not available."
  };
}

export const resolvePassageFromBible = resolveBiblePassage;

export async function getBibleChapter(input: {
  books: string[];
  chapter: number;
  translation: string;
}): Promise<{
  data: StudyPassageResult | null;
  resolvedBook?: string;
  error?: string;
}> {
  if (getLocalBibleVersion(input.translation)) {
    return getChapterFromLocalBible(input);
  }
  if (!isDbsTranslation(input.translation)) {
    return { data: null, error: "That Bible translation is not available." };
  }

  const version = await getBibleVersion(input.translation);
  if (!version || version.provider !== "dbs") {
    return {
      data: null,
      error: "That Digital Bible Society translation is not available."
    };
  }

  for (const book of input.books) {
    const chapter = await loadDbsCandidateChapter({
      translation: version.value,
      book,
      chapter: input.chapter
    });
    if (!chapter) {
      continue;
    }
    return {
      resolvedBook: chapter.book,
      data: {
        origin: "input",
        reference: `${chapter.book} ${input.chapter}`,
        chapterReference: `${chapter.book} ${input.chapter}`,
        translation: version.value,
        translationName: version.title,
        source: toBibleSourceInfo(version),
        verses: chapter.verses,
        chapterPath: null
      }
    };
  }

  return {
    data: null,
    error: `No Scripture text was found for this translation and chapter.`
  };
}

export const getChapterFromBible = getBibleChapter;
