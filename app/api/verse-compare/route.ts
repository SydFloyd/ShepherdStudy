import { NextResponse } from "next/server";
import { z } from "zod";

import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION,
  getTranslationLabel
} from "@/lib/bible";
import { resolvePassageFromLocalBible } from "@/lib/local-bible";
import { prisma } from "@/lib/prisma";
import { buildLinkedSideBySideDiff, buildSideBySideDiff } from "@/lib/text-diff";
import { parseScriptureReference } from "@/lib/scripture";
import type { LinkedDiffSegment } from "@/lib/text-diff";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  leftTranslation: z.enum(BIBLE_TRANSLATION_IDS).default(DEFAULT_BIBLE_TRANSLATION),
  rightTranslation: z.enum(BIBLE_TRANSLATION_IDS).default("kjv")
});

function renderSelectedText(input: {
  verses: Array<{ verse: number; text: string }>;
  includeVerseNumbers: boolean;
}) {
  if (!input.includeVerseNumbers) {
    return input.verses.map((verse) => verse.text).join(" ");
  }
  return input.verses.map((verse) => `${verse.verse} ${verse.text}`).join("\n");
}

function buildVerseDiffRows(input: {
  leftVerses: Array<{ verse: number; paragraph: number; text: string }>;
  rightVerses: Array<{ verse: number; paragraph: number; text: string }>;
}): {
  left: Array<{ verse: number; paragraph: number; segments: LinkedDiffSegment[] }>;
  right: Array<{ verse: number; paragraph: number; segments: LinkedDiffSegment[] }>;
} {
  const leftTextByVerse = new Map(
    input.leftVerses.map((item) => [item.verse, item.text.trim()])
  );
  const rightTextByVerse = new Map(
    input.rightVerses.map((item) => [item.verse, item.text.trim()])
  );
  const verseNumbers = Array.from(
    new Set([...leftTextByVerse.keys(), ...rightTextByVerse.keys()])
  ).sort((a, b) => a - b);

  const leftSegmentsByVerse = new Map<number, LinkedDiffSegment[]>();
  const rightSegmentsByVerse = new Map<number, LinkedDiffSegment[]>();

  for (const verse of verseNumbers) {
    const leftText = leftTextByVerse.get(verse) ?? "";
    const rightText = rightTextByVerse.get(verse) ?? "";
    const diff = buildLinkedSideBySideDiff({
      leftText,
      rightText
    });
    leftSegmentsByVerse.set(verse, diff.left);
    rightSegmentsByVerse.set(verse, diff.right);
  }

  return {
    left: input.leftVerses.map((item) => ({
      verse: item.verse,
      paragraph: item.paragraph,
      segments: leftSegmentsByVerse.get(item.verse) ?? []
    })),
    right: input.rightVerses.map((item) => ({
      verse: item.verse,
      paragraph: item.paragraph,
      segments: rightSegmentsByVerse.get(item.verse) ?? []
    }))
  };
}

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

    const includeVerseNumbers = true;
    const leftText = renderSelectedText({
      verses: left.selectedVerses,
      includeVerseNumbers
    });
    const rightText = renderSelectedText({
      verses: right.selectedVerses,
      includeVerseNumbers
    });
    const diff = buildSideBySideDiff({ leftText, rightText });
    const verseDiffRows = buildVerseDiffRows({
      leftVerses: left.selectedVerses,
      rightVerses: right.selectedVerses
    });

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
        text: leftText,
        segments: diff.left,
        verses: verseDiffRows.left
      },
      right: {
        translation: input.rightTranslation,
        translationName: getTranslationLabel(input.rightTranslation),
        text: rightText,
        segments: diff.right,
        verses: verseDiffRows.right
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid verse comparison request." },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Unable to compare verses right now." },
      { status: 500 }
    );
  }
}
