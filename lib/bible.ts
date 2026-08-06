import { z } from "zod";

export const LOCAL_BIBLE_TRANSLATION_IDS = [
  "web",
  "kjv",
  "asv",
  "uhb",
  "ugnt"
] as const;
export type LocalBibleTranslationId =
  (typeof LOCAL_BIBLE_TRANSLATION_IDS)[number];
export type BibleTranslationId = string;
export const DEFAULT_BIBLE_TRANSLATION = "web";
export const DEFAULT_BIBLE_LANGUAGE = "eng";
export const bibleLanguageIsoSchema = z
  .string()
  .trim()
  .min(2)
  .max(16)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid Bible language.")
  .transform((value) => value.toLowerCase());

export const DBS_TRANSLATION_PREFIX = "dbs:";
const DBS_BIBLE_ID_RE = /^[A-Za-z0-9_-]{2,48}$/;

export function isDbsBibleId(value: string): boolean {
  return DBS_BIBLE_ID_RE.test(value);
}

export const bibleTranslationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine(
    (value) =>
      (LOCAL_BIBLE_TRANSLATION_IDS as readonly string[]).includes(value) ||
      (value.startsWith(DBS_TRANSLATION_PREFIX) &&
        isDbsBibleId(value.slice(DBS_TRANSLATION_PREFIX.length))),
    "Invalid Bible translation."
  );

export function isDbsTranslation(translation: string): boolean {
  return (
    translation.startsWith(DBS_TRANSLATION_PREFIX) &&
    isDbsBibleId(translation.slice(DBS_TRANSLATION_PREFIX.length))
  );
}

export function getDbsBibleId(translation: string): string | null {
  return isDbsTranslation(translation)
    ? translation.slice(DBS_TRANSLATION_PREFIX.length)
    : null;
}

export function toDbsTranslationId(bibleId: string): string {
  if (!isDbsBibleId(bibleId)) {
    throw new Error("Invalid DBS Bible identifier.");
  }
  return `${DBS_TRANSLATION_PREFIX}${bibleId}`;
}

export type MemorizationTranslationId = BibleTranslationId;

export type BibleTextDirection = "ltr" | "rtl";
export type BibleProvider = "local" | "dbs";

export type BibleVersion = {
  value: string;
  provider: BibleProvider;
  providerId: string;
  label: string;
  title: string;
  vernacularTitle: string | null;
  languageName: string;
  languageIso: string;
  script: string;
  direction: BibleTextDirection;
  year: number | null;
  copyright: string | null;
  originalLanguage: boolean;
};

export type BibleSourceInfo = Pick<
  BibleVersion,
  | "provider"
  | "providerId"
  | "title"
  | "vernacularTitle"
  | "languageName"
  | "languageIso"
  | "script"
  | "direction"
  | "year"
  | "copyright"
> & {
  translation: string;
};

const LOCAL_VERSION_DETAILS: Record<LocalBibleTranslationId, BibleVersion> = {
  web: {
    value: "web",
    provider: "local",
    providerId: "web",
    label: "WEB (default)",
    title: "World English Bible",
    vernacularTitle: "World English Bible",
    languageName: "English",
    languageIso: "eng",
    script: "Latn",
    direction: "ltr",
    year: 2000,
    copyright: "Public Domain",
    originalLanguage: false
  },
  kjv: {
    value: "kjv",
    provider: "local",
    providerId: "kjv",
    label: "KJV",
    title: "King James Version",
    vernacularTitle: "King James Version",
    languageName: "English",
    languageIso: "eng",
    script: "Latn",
    direction: "ltr",
    year: 1611,
    copyright: "Public Domain",
    originalLanguage: false
  },
  asv: {
    value: "asv",
    provider: "local",
    providerId: "asv",
    label: "ASV",
    title: "American Standard Version",
    vernacularTitle: "American Standard Version",
    languageName: "English",
    languageIso: "eng",
    script: "Latn",
    direction: "ltr",
    year: 1901,
    copyright: "Public Domain",
    originalLanguage: false
  },
  uhb: {
    value: "uhb",
    provider: "local",
    providerId: "uhb",
    label: "UHB (Hebrew OT)",
    title: "unfoldingWord Hebrew Bible",
    vernacularTitle: null,
    languageName: "Hebrew",
    languageIso: "heb",
    script: "Hebr",
    direction: "rtl",
    year: null,
    copyright: "CC BY-SA 4.0",
    originalLanguage: true
  },
  ugnt: {
    value: "ugnt",
    provider: "local",
    providerId: "ugnt",
    label: "UGNT (Greek NT)",
    title: "unfoldingWord Greek New Testament",
    vernacularTitle: null,
    languageName: "Greek",
    languageIso: "grc",
    script: "Grek",
    direction: "ltr",
    year: null,
    copyright: "CC BY-SA 4.0",
    originalLanguage: true
  }
};

export const LOCAL_BIBLE_VERSIONS = LOCAL_BIBLE_TRANSLATION_IDS.map(
  (translation) => LOCAL_VERSION_DETAILS[translation]
);

export const DBS_LOCAL_EQUIVALENTS: Record<string, LocalBibleTranslationId> = {
  ENGWEB: "web",
  ENGKJV: "kjv",
  ENGASV: "asv"
};

export function getLocalBibleVersion(
  translation: string
): BibleVersion | null {
  return (LOCAL_BIBLE_TRANSLATION_IDS as readonly string[]).includes(translation)
    ? LOCAL_VERSION_DETAILS[translation as LocalBibleTranslationId]
    : null;
}

export function toBibleSourceInfo(version: BibleVersion): BibleSourceInfo {
  return {
    translation: version.value,
    provider: version.provider,
    providerId: version.providerId,
    title: version.title,
    vernacularTitle: version.vernacularTitle,
    languageName: version.languageName,
    languageIso: version.languageIso,
    script: version.script,
    direction: version.direction,
    year: version.year,
    copyright: version.copyright
  };
}

export function isMemorizationTranslation(
  value: string
): value is MemorizationTranslationId {
  return bibleTranslationIdSchema.safeParse(value).success;
}

export function getTranslationLabel(translation: string): string {
  return (
    getLocalBibleVersion(translation)?.label ??
    getDbsBibleId(translation) ??
    translation.toUpperCase()
  );
}

export function getBookOrderByName(book: string): number | null {
  const normalized = normalizeForMatch(book);
  const index = CANONICAL_BOOKS.findIndex(
    (candidate) => normalizeForMatch(candidate) === normalized
  );
  if (index === -1) {
    return null;
  }
  return index + 1;
}

export function isOldTestamentBook(book: string): boolean | null {
  const order = getBookOrderByName(book);
  if (!order) {
    return null;
  }
  return order <= 39;
}

export function isTranslationCompatibleWithBook(
  translation: string,
  book: string
): boolean {
  const isOt = isOldTestamentBook(book);
  if (isOt === null) {
    return true;
  }
  if (translation === "uhb") {
    return isOt;
  }
  if (translation === "ugnt") {
    return !isOt;
  }
  return true;
}

const RTL_SCRIPTS = new Set([
  "Adlm",
  "Arab",
  "Aran",
  "Armi",
  "Avst",
  "Chrs",
  "Cprt",
  "Elym",
  "Hatr",
  "Hebr",
  "Hung",
  "Khar",
  "Khoj",
  "Lydi",
  "Mand",
  "Mani",
  "Mend",
  "Merc",
  "Mero",
  "Narb",
  "Nbat",
  "Nkoo",
  "Orkh",
  "Palm",
  "Phli",
  "Phlp",
  "Phlv",
  "Phnx",
  "Prti",
  "Rohg",
  "Samr",
  "Sarb",
  "Sogd",
  "Sogo",
  "Syrc",
  "Syre",
  "Syrj",
  "Syrn",
  "Thaa",
  "Yezi"
]);

export function getBibleTextDirection(input: {
  translation?: string;
  script?: string | null;
}): BibleTextDirection {
  const script = input.script?.trim();
  const normalizedScript = script
    ? `${script.charAt(0).toUpperCase()}${script.slice(1).toLowerCase()}`
    : null;
  if (
    input.translation === "uhb" ||
    (normalizedScript && RTL_SCRIPTS.has(normalizedScript))
  ) {
    return "rtl";
  }
  return "ltr";
}

export function isRtlTranslation(
  translation: string,
  script?: string | null
): boolean {
  return getBibleTextDirection({ translation, script }) === "rtl";
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
