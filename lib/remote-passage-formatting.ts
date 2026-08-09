import { resolveBibleBookCandidates } from "@/lib/bible";
import { prisma } from "@/lib/prisma";

type ParagraphVerse = {
  verse: number;
  paragraph: number;
};

export function applyParagraphTemplate<T extends ParagraphVerse>(
  verses: T[],
  template: ParagraphVerse[],
): T[] {
  const paragraphsByVerse = new Map(
    template
      .filter((row) => row.paragraph > 0)
      .map((row) => [row.verse, row.paragraph]),
  );

  if (paragraphsByVerse.size === 0) {
    return verses;
  }

  return verses.map((verse) => {
    const paragraph = paragraphsByVerse.get(verse.verse);
    return paragraph === undefined ? verse : { ...verse, paragraph };
  });
}

export async function applyLocalParagraphFormatting<T extends ParagraphVerse>(
  input: {
    book: string;
    chapter: number;
    verses: T[];
  },
): Promise<T[]> {
  if (input.verses.length === 0) {
    return input.verses;
  }

  const bookCandidates = Array.from(
    new Set([input.book, ...resolveBibleBookCandidates(input.book)]),
  );
  const rows = await prisma.bibleVerse.findMany({
    where: {
      translation: "web",
      book: { in: bookCandidates },
      chapter: input.chapter,
      verse: { in: input.verses.map((verse) => verse.verse) },
    },
    orderBy: { verse: "asc" },
    select: { book: true, verse: true, paragraph: true },
  });
  const templateBook = bookCandidates.find((candidate) =>
    rows.some((row) => row.book === candidate),
  );
  if (!templateBook) {
    return input.verses;
  }

  return applyParagraphTemplate(
    input.verses,
    rows.filter((row) => row.book === templateBook),
  );
}
