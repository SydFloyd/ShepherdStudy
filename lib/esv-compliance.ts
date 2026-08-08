import type { BibleSourceInfo } from "@/lib/bible";
import { getBookOrderByName } from "@/lib/bible";
import { BibleProviderError } from "@/lib/bible-provider-error";
import { prisma } from "@/lib/prisma";
import { parseScriptureReference } from "@/lib/scripture";

export const ESV_DISPLAY_MAX_VERSES = 450;
export const ESV_BOOK_DISPLAY_RATIO = 0.45;

export type EsvDisplaySelection = {
  bookOrder: number;
  verseCount: number;
};

type ScriptureSelection = {
  translation: string;
  source?: BibleSourceInfo;
  reference: string;
  verses: Array<{ verse: number }>;
};

export function toEsvDisplaySelection(
  passage: ScriptureSelection
): EsvDisplaySelection | null {
  if (passage.translation !== "esv" && passage.source?.provider !== "esv") {
    return null;
  }

  const parsed = parseScriptureReference(passage.reference);
  const bookOrder = parsed ? getBookOrderByName(parsed.book) : null;
  if (!bookOrder || passage.verses.length === 0) {
    return null;
  }

  return {
    bookOrder,
    verseCount: passage.verses.length
  };
}

export function getEsvDisplayLimitViolation(input: {
  selections: EsvDisplaySelection[];
  bookVerseCounts: Map<number, number>;
}): "global" | "book" | null {
  const globalVerseCount = input.selections.reduce(
    (total, selection) => total + selection.verseCount,
    0
  );
  if (globalVerseCount > ESV_DISPLAY_MAX_VERSES) {
    return "global";
  }

  const versesByBook = new Map<number, number>();
  for (const selection of input.selections) {
    versesByBook.set(
      selection.bookOrder,
      (versesByBook.get(selection.bookOrder) ?? 0) + selection.verseCount
    );
  }

  for (const [bookOrder, verseCount] of versesByBook) {
    const bookVerseCount = input.bookVerseCounts.get(bookOrder) ?? 0;
    const maximumForBook = Math.floor(
      bookVerseCount * ESV_BOOK_DISPLAY_RATIO
    );
    if (bookVerseCount < 1 || verseCount > maximumForBook) {
      return "book";
    }
  }

  return null;
}

export class EsvDisplayBudget {
  private readonly selections: EsvDisplaySelection[] = [];
  private readonly bookVerseCounts = new Map<number, number>();

  constructor(
    private readonly countBookVerses: (bookOrder: number) => Promise<number> =
      (bookOrder) =>
        prisma.bibleVerse.count({ where: { translation: "web", bookOrder } })
  ) {}

  private async getBookVerseCount(bookOrder: number) {
    const existing = this.bookVerseCounts.get(bookOrder);
    if (existing !== undefined) {
      return existing;
    }

    const count = await this.countBookVerses(bookOrder);
    this.bookVerseCounts.set(bookOrder, count);
    return count;
  }

  async reserve(selection: EsvDisplaySelection | null): Promise<boolean> {
    if (!selection) {
      return true;
    }

    await this.getBookVerseCount(selection.bookOrder);
    const nextSelections = [...this.selections, selection];
    if (
      getEsvDisplayLimitViolation({
        selections: nextSelections,
        bookVerseCounts: this.bookVerseCounts
      })
    ) {
      return false;
    }

    this.selections.push(selection);
    return true;
  }

  async assert(selection: EsvDisplaySelection | null): Promise<void> {
    if (await this.reserve(selection)) {
      return;
    }

    throw new BibleProviderError(
      "The combined ESV quotations exceed the per-page usage limits.",
      "esv",
      "request_too_large"
    );
  }
}
