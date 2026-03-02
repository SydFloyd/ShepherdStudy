import { prisma } from "@/lib/prisma";
import { buildPassagePath } from "@/lib/scripture";
import { extractStrongCandidates, normalizeStrongCode } from "@/lib/strongs";

type SourceTranslation = "ugnt" | "uhb";

const GREEK_SCRIPT_RE = /[\u0370-\u03ff\u1f00-\u1fff]/;
const HEBREW_SCRIPT_RE = /[\u0590-\u05ff]/;

function inferSourceFromScript(input: string): SourceTranslation | null {
  if (GREEK_SCRIPT_RE.test(input)) {
    return "ugnt";
  }
  if (HEBREW_SCRIPT_RE.test(input)) {
    return "uhb";
  }
  return null;
}

export function inferSourceTranslation(input: {
  query: string;
  requestedSource?: SourceTranslation | null;
}): SourceTranslation {
  if (input.requestedSource) {
    return input.requestedSource;
  }

  const strongCandidates = extractStrongCandidates(input.query);
  if (strongCandidates[0]?.startsWith("G")) {
    return "ugnt";
  }
  if (strongCandidates[0]?.startsWith("H")) {
    return "uhb";
  }

  const scriptInferred = inferSourceFromScript(input.query);
  if (scriptInferred) {
    return scriptInferred;
  }

  return "ugnt";
}

function normalizeLemma(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

function buildStrongSearchCandidates(strong: string) {
  const normalized = normalizeStrongCode(strong);
  if (!normalized) {
    return [];
  }
  const prefix = normalized.slice(0, 1);
  const digits = normalized.slice(1);
  if (!digits) {
    return [normalized];
  }

  const variants = new Set<string>([
    `${prefix}${digits}`,
    `${prefix}${digits.padStart(4, "0")}`,
    `${prefix}${digits.padStart(5, "0")}`,
    `${prefix}${digits.padStart(6, "0")}`
  ]);
  return Array.from(variants);
}

type CanonicalResolution = {
  resolvedStrong: string;
  resolvedLemma: string;
  sourceTranslation: SourceTranslation;
  source: "lexicon" | "word_frequency";
};

async function resolveCanonicalPair(input: {
  query: string;
  sourceTranslation: SourceTranslation;
}): Promise<CanonicalResolution | null> {
  const normalizedQuery = input.query.trim();
  const strongToken = normalizeStrongCode(normalizedQuery);
  const strongSearchCandidates = strongToken
    ? buildStrongSearchCandidates(strongToken)
    : [];
  const normalizedLemma = normalizeLemma(normalizedQuery);

  if (strongToken) {
    const lexicon = await prisma.bibleLexicon.findUnique({
      where: { strong: strongToken },
      select: { strong: true, lemma: true }
    });
    if (lexicon?.lemma) {
      return {
        resolvedStrong: lexicon.strong,
        resolvedLemma: lexicon.lemma,
        sourceTranslation: input.sourceTranslation,
        source: "lexicon"
      };
    }
  }

  if (!strongToken && normalizedLemma) {
    const lexiconByLemma = await prisma.bibleLexicon.findFirst({
      where: {
        lemma: normalizedLemma,
        language: input.sourceTranslation === "ugnt" ? "greek" : "hebrew"
      },
      orderBy: { strong: "asc" },
      select: { strong: true, lemma: true }
    });
    if (lexiconByLemma?.strong && lexiconByLemma.lemma) {
      return {
        resolvedStrong: lexiconByLemma.strong,
        resolvedLemma: lexiconByLemma.lemma,
        sourceTranslation: input.sourceTranslation,
        source: "lexicon"
      };
    }
  }

  const frequencyRows = await prisma.bibleWord.findMany({
    where: {
      translation: input.sourceTranslation,
      ...(strongToken
        ? {
            OR: strongSearchCandidates.map((candidate) => ({
              strong: { contains: candidate }
            }))
          }
        : {}),
      ...(!strongToken && normalizedLemma ? { lemma: normalizedLemma } : {})
    },
    select: { lemma: true, strong: true },
    take: 5000
  });

  const countByPair = new Map<string, number>();
  for (const row of frequencyRows) {
    if (!row.lemma || !row.strong) {
      continue;
    }
    const normalizedStrongs = extractStrongCandidates(row.strong);
    if (
      strongToken &&
      !normalizedStrongs.some((candidate) => candidate === strongToken)
    ) {
      continue;
    }

    const normalizedStrong =
      normalizedStrongs[0] ?? normalizeStrongCode(row.strong) ?? null;
    if (!normalizedStrong) {
      continue;
    }

    const pairKey = `${normalizedStrong}::${row.lemma}`;
    countByPair.set(pairKey, (countByPair.get(pairKey) ?? 0) + 1);
  }

  const topPair = Array.from(countByPair.entries()).sort(
    (a, b) => b[1] - a[1]
  )[0];
  if (!topPair) {
    return null;
  }

  const [resolvedStrong, resolvedLemma] = topPair[0].split("::");
  if (!resolvedStrong || !resolvedLemma) {
    return null;
  }

  return {
    resolvedStrong,
    resolvedLemma,
    sourceTranslation: input.sourceTranslation,
    source: "word_frequency"
  };
}

type BookStatAccumulator = {
  book: string;
  bookOrder: number;
  count: number;
  firstChapter: number;
  firstVerse: number;
  lastChapter: number;
  lastVerse: number;
};

function formatReference(book: string, chapter: number, verse: number) {
  return `${book} ${chapter}:${verse}`;
}

export type WordAnalyticsPayload = {
  query: {
    input: string;
    resolvedStrong: string;
    resolvedLemma: string;
    sourceTranslation: SourceTranslation;
  };
  lexicon: {
    lemma: string;
    translit: string | null;
    strongsDef: string | null;
    kjvDef: string | null;
  };
  bookStats: Array<{
    book: string;
    bookOrder: number;
    count: number;
    firstReference: string;
    lastReference: string;
  }>;
  occurrences: {
    book: string | null;
    page: number;
    pageSize: number;
    total: number;
    items: Array<{
      reference: string;
      chapter: number;
      verse: number;
      position: number;
      previewWords: string[];
      chapterPath: string | null;
    }>;
  };
};

export async function buildWordAnalyticsPayload(input: {
  query: string;
  sourceTranslation?: SourceTranslation | null;
  book?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const sourceTranslation = inferSourceTranslation({
    query: input.query,
    requestedSource: input.sourceTranslation
  });
  const pageSize = Math.max(10, Math.min(100, input.pageSize ?? 50));
  const page = Math.max(1, input.page ?? 1);
  const canonical = await resolveCanonicalPair({
    query: input.query,
    sourceTranslation
  });

  if (!canonical) {
    return null;
  }

  const lexicon = await prisma.bibleLexicon.findUnique({
    where: { strong: canonical.resolvedStrong },
    select: {
      lemma: true,
      translit: true,
      strongsDef: true,
      kjvDef: true
    }
  });

  const candidateRows = await prisma.bibleWord.findMany({
    where: {
      translation: canonical.sourceTranslation,
      lemma: canonical.resolvedLemma,
      OR: buildStrongSearchCandidates(canonical.resolvedStrong).map(
        (candidate) => ({
          strong: { contains: candidate }
        })
      )
    },
    select: {
      book: true,
      bookOrder: true,
      chapter: true,
      verse: true,
      position: true,
      strong: true
    },
    orderBy: [
      { bookOrder: "asc" },
      { chapter: "asc" },
      { verse: "asc" },
      { position: "asc" }
    ]
  });

  const occurrenceRows = candidateRows.filter((row) =>
    extractStrongCandidates(row.strong).includes(canonical.resolvedStrong)
  );
  if (occurrenceRows.length === 0) {
    return null;
  }

  const statsByBook = new Map<string, BookStatAccumulator>();
  for (const row of occurrenceRows) {
    const current = statsByBook.get(row.book);
    if (!current) {
      statsByBook.set(row.book, {
        book: row.book,
        bookOrder: row.bookOrder,
        count: 1,
        firstChapter: row.chapter,
        firstVerse: row.verse,
        lastChapter: row.chapter,
        lastVerse: row.verse
      });
      continue;
    }

    current.count += 1;
    if (
      row.chapter < current.firstChapter ||
      (row.chapter === current.firstChapter && row.verse < current.firstVerse)
    ) {
      current.firstChapter = row.chapter;
      current.firstVerse = row.verse;
    }
    if (
      row.chapter > current.lastChapter ||
      (row.chapter === current.lastChapter && row.verse > current.lastVerse)
    ) {
      current.lastChapter = row.chapter;
      current.lastVerse = row.verse;
    }
  }

  const bookStats = Array.from(statsByBook.values())
    .sort((a, b) => a.bookOrder - b.bookOrder)
    .map((item) => ({
      book: item.book,
      bookOrder: item.bookOrder,
      count: item.count,
      firstReference: formatReference(
        item.book,
        item.firstChapter,
        item.firstVerse
      ),
      lastReference: formatReference(item.book, item.lastChapter, item.lastVerse)
    }));

  const selectedBook =
    input.book && statsByBook.has(input.book) ? input.book : bookStats[0]?.book ?? null;
  const selectedRows = selectedBook
    ? occurrenceRows.filter((row) => row.book === selectedBook)
    : occurrenceRows;
  const total = selectedRows.length;
  const offset = (page - 1) * pageSize;
  const pageRows = selectedRows.slice(offset, offset + pageSize);
  const pageVerseScope = Array.from(
    new Set(pageRows.map((row) => `${row.book}::${row.chapter}::${row.verse}`))
  ).map((key) => {
    const [book, chapterText, verseText] = key.split("::");
    return {
      book,
      chapter: Number(chapterText),
      verse: Number(verseText)
    };
  });

  const verseWordRows =
    pageVerseScope.length > 0
      ? await prisma.bibleWord.findMany({
          where: {
            translation: canonical.sourceTranslation,
            OR: pageVerseScope
          },
          orderBy: [
            { bookOrder: "asc" },
            { chapter: "asc" },
            { verse: "asc" },
            { position: "asc" }
          ],
          select: {
            book: true,
            chapter: true,
            verse: true,
            text: true
          }
        })
      : [];

  const wordsByVerse = new Map<string, string[]>();
  for (const row of verseWordRows) {
    const key = `${row.book}::${row.chapter}::${row.verse}`;
    const list = wordsByVerse.get(key) ?? [];
    list.push(row.text);
    wordsByVerse.set(key, list);
  }

  const items = pageRows.map((row) => {
    const reference = formatReference(row.book, row.chapter, row.verse);
    const verseKey = `${row.book}::${row.chapter}::${row.verse}`;
    return {
      reference,
      chapter: row.chapter,
      verse: row.verse,
      position: row.position,
      previewWords: wordsByVerse.get(verseKey) ?? [],
      chapterPath: buildPassagePath(reference, canonical.sourceTranslation)
    };
  });

  const payload: WordAnalyticsPayload = {
    query: {
      input: input.query,
      resolvedStrong: canonical.resolvedStrong,
      resolvedLemma: canonical.resolvedLemma,
      sourceTranslation: canonical.sourceTranslation
    },
    lexicon: {
      lemma: lexicon?.lemma ?? canonical.resolvedLemma,
      translit: lexicon?.translit ?? null,
      strongsDef: lexicon?.strongsDef ?? null,
      kjvDef: lexicon?.kjvDef ?? null
    },
    bookStats,
    occurrences: {
      book: selectedBook,
      page,
      pageSize,
      total,
      items
    }
  };

  return payload;
}
