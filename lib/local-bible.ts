import {
  getTranslationLabel,
  isTranslationCompatibleWithBook,
  resolveBibleBookCandidates
} from "@/lib/bible";
import { prisma } from "@/lib/prisma";
import {
  buildPassagePath,
  ParsedReference,
  parseScriptureReference
} from "@/lib/scripture";
import { PassageVerse, StudyPassageResult } from "@/lib/study-contract";

function attachNotesToVerses(
  rows: Array<{ verse: number; paragraph: number; text: string }>,
  notes: Array<{
    verse: number;
    kind: string;
    caller: string | null;
    text: string;
  }>
): PassageVerse[] {
  const notesByVerse = new Map<number, PassageVerse["notes"]>();
  for (const note of notes) {
    const list = notesByVerse.get(note.verse) ?? [];
    if (note.kind === "footnote" || note.kind === "crossref") {
      list.push({
        kind: note.kind,
        caller: note.caller,
        text: note.text
      });
      notesByVerse.set(note.verse, list);
    }
  }

  return rows.map((row) => ({
    verse: row.verse,
    paragraph: row.paragraph,
    text: row.text,
    notes: notesByVerse.get(row.verse) ?? []
  }));
}

export type PassageResolutionResult =
  | {
      ok: true;
      parsed: ParsedReference;
      resolvedBook: string;
      chapterVerses: PassageVerse[];
      selectedVerses: PassageVerse[];
      chapterReference: string;
      chapterPath: string | null;
      translationName: string;
    }
  | {
      ok: false;
      reason: "invalid_reference" | "not_found";
      message: string;
      parsed?: ParsedReference;
      bookCandidates?: string[];
    };

function formatReferenceForPath(
  book: string,
  parsed: ParsedReference
): string {
  if (!parsed.verseStart) {
    return `${book} ${parsed.chapter}`;
  }

  const verseRange = parsed.verseEnd
    ? `${parsed.verseStart}-${parsed.verseEnd}`
    : `${parsed.verseStart}`;
  return `${book} ${parsed.chapter}:${verseRange}`;
}

export async function resolvePassageFromLocalBible(input: {
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

  const bookCandidates = Array.from(
    new Set([parsed.book, ...resolveBibleBookCandidates(parsed.book)])
  );
  const compatibleCandidates = bookCandidates.filter((candidate) =>
    isTranslationCompatibleWithBook(input.translation, candidate)
  );
  if (compatibleCandidates.length === 0) {
    const requestedRange = input.translation === "uhb" ? "Old Testament" : "New Testament";
    return {
      ok: false,
      reason: "not_found",
      message: `${getTranslationLabel(input.translation)} only includes ${requestedRange} books.`,
      parsed,
      bookCandidates
    };
  }

  for (const book of compatibleCandidates) {
    const rows = await prisma.bibleVerse.findMany({
      where: {
        translation: input.translation,
        book,
        chapter: parsed.chapter
      },
      orderBy: {
        verse: "asc"
      },
      select: {
        verse: true,
        paragraph: true,
        text: true
      }
    });

    if (rows.length === 0) {
      continue;
    }

    const noteRows = await prisma.bibleFootnote.findMany({
      where: {
        translation: input.translation,
        book,
        chapter: parsed.chapter
      },
      orderBy: [{ verse: "asc" }, { id: "asc" }],
      select: {
        verse: true,
        kind: true,
        caller: true,
        text: true
      }
    });

    const chapterVerses = attachNotesToVerses(rows, noteRows);
    const verseStart = parsed.verseStart;
    const verseEnd = parsed.verseEnd ?? parsed.verseStart;
    const selectedVerses = verseStart
      ? chapterVerses.filter(
          (row) =>
            row.verse >= verseStart &&
            row.verse <= (verseEnd ?? Number.MAX_SAFE_INTEGER)
        )
      : chapterVerses;

    const chapterReference = `${book} ${parsed.chapter}`;
    const chapterPath = buildPassagePath(
      formatReferenceForPath(book, parsed),
      input.translation
    );

    return {
      ok: true,
      parsed,
      resolvedBook: book,
      chapterVerses,
      selectedVerses,
      chapterReference,
      chapterPath,
      translationName: getTranslationLabel(input.translation)
    };
  }

  return {
    ok: false,
    reason: "not_found",
    message: "Passage not found in local Bible text for this version.",
    parsed,
    bookCandidates: compatibleCandidates
  };
}

export async function getChapterFromLocalBible(input: {
  books: string[];
  chapter: number;
  translation: string;
}): Promise<{
  data: StudyPassageResult | null;
  resolvedBook?: string;
  error?: string;
}> {
  const compatibleBooks = input.books.filter((book) =>
    isTranslationCompatibleWithBook(input.translation, book)
  );
  for (const book of compatibleBooks) {
    const rows = await prisma.bibleVerse.findMany({
      where: {
        translation: input.translation,
        book,
        chapter: input.chapter
      },
      orderBy: {
        verse: "asc"
      },
      select: {
        verse: true,
        paragraph: true,
        text: true
      }
    });

    if (rows.length === 0) {
      continue;
    }

    const noteRows = await prisma.bibleFootnote.findMany({
      where: {
        translation: input.translation,
        book,
        chapter: input.chapter
      },
      orderBy: [{ verse: "asc" }, { id: "asc" }],
      select: {
        verse: true,
        kind: true,
        caller: true,
        text: true
      }
    });

    return {
      resolvedBook: book,
      data: {
        origin: "input",
        reference: `${book} ${input.chapter}`,
        chapterReference: `${book} ${input.chapter}`,
        translation: input.translation,
        translationName: getTranslationLabel(input.translation),
        verses: attachNotesToVerses(rows, noteRows),
        chapterPath: null
      }
    };
  }

  return {
    data: null,
    error:
      compatibleBooks.length === 0
        ? `${getTranslationLabel(input.translation)} does not include books in this testament.`
        : `No local verses found for translation "${input.translation}" and chapter.`
  };
}
