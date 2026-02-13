export const BIBLE_TRANSLATION_IDS = ["web", "kjv", "asv"] as const;
export type BibleTranslationId = (typeof BIBLE_TRANSLATION_IDS)[number];
export const DEFAULT_BIBLE_TRANSLATION: BibleTranslationId = "web";

export const BIBLE_TRANSLATIONS = [
  { value: "web", label: "WEB (default)" },
  { value: "kjv", label: "KJV" },
  { value: "asv", label: "ASV" }
] as const;

export const BIBLE_TRANSLATION_BY_ID = Object.fromEntries(
  BIBLE_TRANSLATIONS.map((item) => [item.value, item.label])
) as Record<string, string>;

export function getTranslationLabel(translation: string): string {
  return BIBLE_TRANSLATION_BY_ID[translation] ?? translation.toUpperCase();
}

const CANONICAL_BOOKS = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation"
] as const;

export const BOOK_CODE_ENTRIES = [
  ["GEN", "Genesis"],
  ["EXO", "Exodus"],
  ["LEV", "Leviticus"],
  ["NUM", "Numbers"],
  ["DEU", "Deuteronomy"],
  ["JOS", "Joshua"],
  ["JDG", "Judges"],
  ["RUT", "Ruth"],
  ["1SA", "1 Samuel"],
  ["2SA", "2 Samuel"],
  ["1KI", "1 Kings"],
  ["2KI", "2 Kings"],
  ["1CH", "1 Chronicles"],
  ["2CH", "2 Chronicles"],
  ["EZR", "Ezra"],
  ["NEH", "Nehemiah"],
  ["EST", "Esther"],
  ["JOB", "Job"],
  ["PSA", "Psalms"],
  ["PRO", "Proverbs"],
  ["ECC", "Ecclesiastes"],
  ["SOL", "Song of Solomon"],
  ["ISA", "Isaiah"],
  ["JER", "Jeremiah"],
  ["LAM", "Lamentations"],
  ["EZE", "Ezekiel"],
  ["DAN", "Daniel"],
  ["HOS", "Hosea"],
  ["JOE", "Joel"],
  ["AMO", "Amos"],
  ["OBA", "Obadiah"],
  ["JON", "Jonah"],
  ["MIC", "Micah"],
  ["NAH", "Nahum"],
  ["HAB", "Habakkuk"],
  ["ZEP", "Zephaniah"],
  ["HAG", "Haggai"],
  ["ZEC", "Zechariah"],
  ["MAL", "Malachi"],
  ["MAT", "Matthew"],
  ["MAR", "Mark"],
  ["LUK", "Luke"],
  ["JOH", "John"],
  ["ACT", "Acts"],
  ["ROM", "Romans"],
  ["1CO", "1 Corinthians"],
  ["2CO", "2 Corinthians"],
  ["GAL", "Galatians"],
  ["EPH", "Ephesians"],
  ["PHI", "Philippians"],
  ["COL", "Colossians"],
  ["1TH", "1 Thessalonians"],
  ["2TH", "2 Thessalonians"],
  ["1TI", "1 Timothy"],
  ["2TI", "2 Timothy"],
  ["TIT", "Titus"],
  ["PHM", "Philemon"],
  ["HEB", "Hebrews"],
  ["JAM", "James"],
  ["1PE", "1 Peter"],
  ["2PE", "2 Peter"],
  ["1JO", "1 John"],
  ["2JO", "2 John"],
  ["3JO", "3 John"],
  ["JUD", "Jude"],
  ["REV", "Revelation"]
] as const;

export const BOOK_BY_CODE = Object.fromEntries(BOOK_CODE_ENTRIES) as Record<
  string,
  string
>;

export const BOOK_ORDER_BY_CODE = Object.fromEntries(
  BOOK_CODE_ENTRIES.map(([code], index) => [code, index + 1])
) as Record<string, number>;

const BOOK_ALIASES: Record<string, string> = {
  psalm: "Psalms",
  song: "Song of Solomon",
  songs: "Song of Solomon",
  songofsongs: "Song of Solomon",
  canticles: "Song of Solomon",
  eccles: "Ecclesiastes",
  prov: "Proverbs",
  deut: "Deuteronomy",
  gen: "Genesis",
  ex: "Exodus",
  lev: "Leviticus",
  num: "Numbers",
  josh: "Joshua",
  judg: "Judges",
  neh: "Nehemiah",
  esth: "Esther",
  isa: "Isaiah",
  jer: "Jeremiah",
  lam: "Lamentations",
  ezek: "Ezekiel",
  dan: "Daniel",
  hab: "Habakkuk",
  zech: "Zechariah",
  matt: "Matthew",
  mk: "Mark",
  lk: "Luke",
  jn: "John",
  acts: "Acts",
  rom: "Romans",
  cor: "1 Corinthians",
  gal: "Galatians",
  eph: "Ephesians",
  phil: "Philippians",
  col: "Colossians",
  thess: "1 Thessalonians",
  tim: "1 Timothy",
  pet: "1 Peter",
  rev: "Revelation"
};

function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );

  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function getNormalizedBookTail(normalizedBook: string): string {
  return normalizedBook.replace(/^[123]/, "");
}

export function resolveBibleBookCandidates(input: string): string[] {
  const normalizedInput = normalizeForMatch(input);
  if (!normalizedInput) {
    return [];
  }

  const aliasMatch = BOOK_ALIASES[normalizedInput];
  if (aliasMatch) {
    return [aliasMatch];
  }

  const exactMatches = CANONICAL_BOOKS.filter(
    (book) => normalizeForMatch(book) === normalizedInput
  );
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const noPrefixInput = getNormalizedBookTail(normalizedInput);
  const numberedMatches = CANONICAL_BOOKS.filter((book) => {
    const normalizedBook = normalizeForMatch(book);
    return getNormalizedBookTail(normalizedBook) === noPrefixInput;
  });
  if (numberedMatches.length > 0) {
    return numberedMatches.slice(0, 3);
  }

  const scored = CANONICAL_BOOKS.map((book) => {
    const normalizedBook = normalizeForMatch(book);
    const distance = levenshtein(normalizedInput, normalizedBook);
    return { book, normalizedBook, distance };
  });

  const fuzzyMatches = scored
    .filter(({ normalizedBook, distance }) => {
      const threshold = Math.max(2, Math.floor(normalizedBook.length * 0.35));
      return (
        distance <= threshold ||
        normalizedBook.includes(normalizedInput) ||
        normalizedInput.includes(normalizedBook)
      );
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 5)
    .map(({ book }) => book);

  return fuzzyMatches;
}
