import { resolveBibleBookCandidates } from "@/lib/bible";

export type ParsedReference = {
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
};

export type ExtractedScriptureReferences = {
  references: string[];
  residualText: string;
};

const referencePattern =
  /^\s*((?:[1-3]\s*)?[A-Za-z][A-Za-z.\s]+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?\s*$/;

const SCRIPTURE_BOOK_TOKENS = [
  "Genesis",
  "Gen",
  "Exodus",
  "Exod",
  "Exo",
  "Leviticus",
  "Lev",
  "Numbers",
  "Num",
  "Deuteronomy",
  "Deut",
  "Joshua",
  "Josh",
  "Judges",
  "Judg",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Sam",
  "2 Sam",
  "1 Kings",
  "2 Kings",
  "1 Kgs",
  "2 Kgs",
  "1 Chronicles",
  "2 Chronicles",
  "1 Chr",
  "2 Chr",
  "Ezra",
  "Nehemiah",
  "Neh",
  "Esther",
  "Esth",
  "Job",
  "Psalms",
  "Psalm",
  "Ps",
  "Psa",
  "Proverbs",
  "Prov",
  "Ecclesiastes",
  "Eccl",
  "Song of Solomon",
  "Song of Songs",
  "Song",
  "Isaiah",
  "Isa",
  "Jeremiah",
  "Jer",
  "Lamentations",
  "Lam",
  "Ezekiel",
  "Ezek",
  "Daniel",
  "Dan",
  "Hosea",
  "Hos",
  "Joel",
  "Amos",
  "Obadiah",
  "Obad",
  "Jonah",
  "Micah",
  "Mic",
  "Nahum",
  "Nah",
  "Habakkuk",
  "Hab",
  "Zephaniah",
  "Zeph",
  "Haggai",
  "Hag",
  "Zechariah",
  "Zech",
  "Malachi",
  "Mal",
  "Matthew",
  "Matt",
  "Mark",
  "Mk",
  "Luke",
  "Lk",
  "John",
  "Jn",
  "Acts",
  "Romans",
  "Rom",
  "1 Corinthians",
  "2 Corinthians",
  "1 Cor",
  "2 Cor",
  "Galatians",
  "Gal",
  "Ephesians",
  "Eph",
  "Philippians",
  "Phil",
  "Colossians",
  "Col",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Thess",
  "2 Thess",
  "1 Timothy",
  "2 Timothy",
  "1 Tim",
  "2 Tim",
  "Titus",
  "Philemon",
  "Philem",
  "Hebrews",
  "Heb",
  "James",
  "Jas",
  "1 Peter",
  "2 Peter",
  "1 Pet",
  "2 Pet",
  "1 John",
  "2 John",
  "3 John",
  "1 Jn",
  "2 Jn",
  "3 Jn",
  "Jude",
  "Revelation",
  "Rev"
] as const;

const MAX_REFERENCE_NUMBER = 199;
const CONTINUATION_PATTERN =
  /^\s*(?:,|;|\/|&|\band\b)\s*(?:(\d{1,3})\s*:\s*)?(\d{1,3})(?:\s*[-\u2013]\s*(\d{1,3}))?(?=\s*(?:,|;|\/|&|\band\b|[.!?)]|$))/i;

const bookPattern = Array.from(new Set(SCRIPTURE_BOOK_TOKENS))
  .sort((a, b) => b.length - a.length)
  .map((token) =>
    token
      .split(/\s+/)
      .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+")
  )
  .join("|");

const scriptureReferencePattern = new RegExp(
  `\\b(${bookPattern})\\b\\.?\\s+(\\d{1,3})(?:\\s*:\\s*(\\d{1,3})(?:\\s*[-\\u2013]\\s*(\\d{1,3}))?)?`,
  "gi"
);

function parseReferenceNumber(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > MAX_REFERENCE_NUMBER) {
    return undefined;
  }

  return value;
}

function formatReference(
  book: string,
  chapter: number,
  verseStart?: number,
  verseEnd?: number
): string {
  if (!verseStart) {
    return `${book} ${chapter}`;
  }

  if (verseEnd && verseEnd >= verseStart) {
    return `${book} ${chapter}:${verseStart}-${verseEnd}`;
  }

  return `${book} ${chapter}:${verseStart}`;
}

function canonicalizeBook(rawBook: string): string {
  const normalized = normalizeBookName(rawBook.replace(/\.$/, ""));
  const candidates = resolveBibleBookCandidates(normalized);
  return candidates[0] ?? normalized;
}

function normalizeResidualText(input: string): string {
  return input
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/([([{\u201c\u2018])\s+/g, "$1")
    .replace(/\s+([)\]}\u201d\u2019])/g, "$1")
    .trim();
}

function mergeRanges(ranges: Array<{ start: number; end: number }>) {
  if (ranges.length === 0) {
    return [];
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    const previous = merged[merged.length - 1];
    if (current.start <= previous.end) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }

    merged.push({ ...current });
  }

  return merged;
}

function stripRanges(input: string, ranges: Array<{ start: number; end: number }>): string {
  if (ranges.length === 0) {
    return normalizeResidualText(input);
  }

  const merged = mergeRanges(ranges);
  let cursor = 0;
  let output = "";

  for (const range of merged) {
    output += input.slice(cursor, range.start);
    cursor = range.end;
  }
  output += input.slice(cursor);

  return normalizeResidualText(output);
}

export function hasMeaningfulPromptText(input: string): boolean {
  const normalized = input
    .toLowerCase()
    .replace(/[,:;.!?()[\]{}"'\u201c\u201d\u2018\u2019]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    return false;
  }

  const connectorWords = new Set(["and", "or", "&", "/", "|"]);
  const tokens = normalized.split(" ").filter(Boolean);

  return tokens.some((token) => !connectorWords.has(token));
}

function pushUniqueReference(
  references: string[],
  seen: Set<string>,
  reference: string
) {
  const normalized = reference.trim().replace(/\s+/g, " ").toLowerCase();
  if (!normalized || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  references.push(reference);
}

export function extractScriptureReferencesFromText(
  input: string
): ExtractedScriptureReferences {
  const references: string[] = [];
  const seen = new Set<string>();
  const ranges: Array<{ start: number; end: number }> = [];
  scriptureReferencePattern.lastIndex = 0;

  if (!input.trim()) {
    return {
      references,
      residualText: ""
    };
  }

  let match = scriptureReferencePattern.exec(input);
  while (match) {
    const start = match.index;
    const rawBook = match[1] ?? "";
    const chapter = parseReferenceNumber(match[2]);
    const verseStart = parseReferenceNumber(match[3]);
    const verseEnd = parseReferenceNumber(match[4]);

    if (!chapter) {
      match = scriptureReferencePattern.exec(input);
      continue;
    }

    const book = canonicalizeBook(rawBook);
    pushUniqueReference(
      references,
      seen,
      formatReference(book, chapter, verseStart, verseEnd)
    );

    let consumedEnd = scriptureReferencePattern.lastIndex;
    let cursor = consumedEnd;

    while (cursor < input.length) {
      const remainder = input.slice(cursor);
      const continuation = CONTINUATION_PATTERN.exec(remainder);
      if (!continuation) {
        break;
      }

      const chapterFromContinuation = parseReferenceNumber(continuation[1]);
      const value = parseReferenceNumber(continuation[2]);
      const end = parseReferenceNumber(continuation[3]);

      if (!value) {
        break;
      }

      const continuationUsesVerse =
        continuation[1] !== undefined || verseStart !== undefined;

      if (continuationUsesVerse) {
        const continuationChapter = chapterFromContinuation ?? chapter;
        pushUniqueReference(
          references,
          seen,
          formatReference(book, continuationChapter, value, end)
        );
      } else {
        pushUniqueReference(references, seen, formatReference(book, value));
      }

      cursor += continuation[0].length;
      consumedEnd = cursor;
    }

    ranges.push({
      start,
      end: consumedEnd
    });

    scriptureReferencePattern.lastIndex = consumedEnd;
    match = scriptureReferencePattern.exec(input);
  }

  return {
    references,
    residualText: stripRanges(input, ranges)
  };
}

export function parseScriptureReference(
  reference: string
): ParsedReference | null {
  const match = referencePattern.exec(reference);
  if (!match) {
    return null;
  }

  const book = normalizeBookName(match[1]);
  const chapter = Number(match[2]);
  const verseStart = match[3] ? Number(match[3]) : undefined;
  const verseEnd = match[4] ? Number(match[4]) : undefined;

  if (!book || !Number.isInteger(chapter) || chapter < 1) {
    return null;
  }

  if (verseStart !== undefined && (!Number.isInteger(verseStart) || verseStart < 1)) {
    return null;
  }

  if (
    verseEnd !== undefined &&
    (!Number.isInteger(verseEnd) || verseEnd < 1 || (verseStart && verseEnd < verseStart))
  ) {
    return null;
  }

  return { book, chapter, verseStart, verseEnd };
}

export function buildPassagePath(
  reference: string,
  translation?: string
): string | null {
  const parsed = parseScriptureReference(reference);
  if (!parsed) {
    return null;
  }

  const bookSlug = parsed.book.toLowerCase().replace(/\s+/g, "-");
  const encodedRef = encodeURIComponent(reference.trim());
  const translationQuery = translation
    ? `&translation=${encodeURIComponent(translation)}`
    : "";
  return `/passage/${bookSlug}/${parsed.chapter}?ref=${encodedRef}${translationQuery}`;
}

export function parseBookSlug(bookSlug: string): string {
  return bookSlug
    .split("-")
    .filter(Boolean)
    .map((segment) => {
      if (/^\d+$/.test(segment)) {
        return segment;
      }
      return segment.charAt(0).toUpperCase() + segment.slice(1);
    })
    .join(" ");
}

export function normalizeBookName(input: string): string {
  return input.replace(/\./g, "").replace(/\s+/g, " ").trim();
}

export function isSameBook(a: string, b: string): boolean {
  return normalizeBookName(a).toLowerCase() === normalizeBookName(b).toLowerCase();
}
