export type ParsedReference = {
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
};

const referencePattern =
  /^\s*((?:[1-3]\s*)?[A-Za-z][A-Za-z.\s]+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?\s*$/;

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

export function buildBibleApiUrl(reference: string, translation = "web"): string {
  const encodedRef = encodeURIComponent(reference.trim());
  const encodedTranslation = encodeURIComponent(translation);
  return `https://bible-api.com/${encodedRef}?translation=${encodedTranslation}`;
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
