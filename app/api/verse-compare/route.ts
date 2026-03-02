import { NextResponse } from "next/server";
import { z } from "zod";

import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION,
  getTranslationLabel
} from "@/lib/bible";
import { resolvePassageFromLocalBible } from "@/lib/local-bible";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailableError } from "@/lib/prisma-errors";
import { parseScriptureReference } from "@/lib/scripture";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  leftTranslation: z.enum(BIBLE_TRANSLATION_IDS).default(DEFAULT_BIBLE_TRANSLATION),
  rightTranslation: z.enum(BIBLE_TRANSLATION_IDS).default("kjv")
});

function formatChapterReference(book: string, chapter: number) {
  return `${book} ${chapter}`;
}

async function getAdjacentChapterReferences(input: {
  translation: string;
  book: string;
  chapter: number;
}) {
  const current = await prisma.bibleVerse.findFirst({
    where: {
      translation: input.translation,
      book: input.book,
      chapter: input.chapter
    },
    orderBy: {
      verse: "asc"
    },
    select: {
      bookOrder: true,
      chapter: true
    }
  });

  if (!current) {
    return { previousReference: null, nextReference: null };
  }

  const [previousChapter, nextChapter] = await Promise.all([
    prisma.bibleVerse.findFirst({
      where: {
        translation: input.translation,
        OR: [
          { bookOrder: { lt: current.bookOrder } },
          {
            bookOrder: current.bookOrder,
            chapter: { lt: current.chapter }
          }
        ]
      },
      orderBy: [{ bookOrder: "desc" }, { chapter: "desc" }, { verse: "asc" }],
      select: {
        book: true,
        chapter: true
      }
    }),
    prisma.bibleVerse.findFirst({
      where: {
        translation: input.translation,
        OR: [
          { bookOrder: { gt: current.bookOrder } },
          {
            bookOrder: current.bookOrder,
            chapter: { gt: current.chapter }
          }
        ]
      },
      orderBy: [{ bookOrder: "asc" }, { chapter: "asc" }, { verse: "asc" }],
      select: {
        book: true,
        chapter: true
      }
    })
  ]);

  return {
    previousReference: previousChapter
      ? formatChapterReference(previousChapter.book, previousChapter.chapter)
      : null,
    nextReference: nextChapter
      ? formatChapterReference(nextChapter.book, nextChapter.chapter)
      : null
  };
}

export async function POST(req: Request) {
  try {
    const input = inputSchema.parse(await req.json());
    const parsed = parseScriptureReference(input.reference);
    if (!parsed) {
      return NextResponse.json(
        { error: "Please provide a valid reference (example: John 3:16)." },
        { status: 400 }
      );
    }

    const [left, right] = await Promise.all([
      resolvePassageFromLocalBible({
        reference: input.reference,
        translation: input.leftTranslation
      }),
      resolvePassageFromLocalBible({
        reference: input.reference,
        translation: input.rightTranslation
      })
    ]);

    if (!left.ok) {
      return NextResponse.json({ error: left.message }, { status: 404 });
    }
    if (!right.ok) {
      return NextResponse.json({ error: right.message }, { status: 404 });
    }

    const { previousReference, nextReference } =
      await getAdjacentChapterReferences({
        translation: input.leftTranslation,
        book: left.resolvedBook,
        chapter: parsed.chapter
      });

    return NextResponse.json({
      reference: left.resolvedReference,
      previousReference,
      nextReference,
      left: {
        translation: input.leftTranslation,
        translationName: getTranslationLabel(input.leftTranslation),
        verses: left.selectedVerses.map((item) => ({
          verse: item.verse,
          paragraph: item.paragraph,
          text: item.text.trim()
        }))
      },
      right: {
        translation: input.rightTranslation,
        translationName: getTranslationLabel(input.rightTranslation),
        verses: right.selectedVerses.map((item) => ({
          verse: item.verse,
          paragraph: item.paragraph,
          text: item.text.trim()
        }))
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid verse comparison request." },
        { status: 400 }
      );
    }
    if (isPrismaDatabaseUnavailableError(error)) {
      return NextResponse.json(
        { error: "Database temporarily unavailable. Please retry in a moment." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Unable to compare verses right now." },
      { status: 500 }
    );
  }
}
