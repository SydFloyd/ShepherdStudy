import { NextResponse } from "next/server";
import { z } from "zod";

import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION,
  getTranslationLabel
} from "@/lib/bible";
import { resolvePassageFromLocalBible } from "@/lib/local-bible";
import { buildSideBySideDiff } from "@/lib/text-diff";
import { parseScriptureReference } from "@/lib/scripture";

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

function formatVerseReference(book: string, chapter: number, verse: number) {
  return `${book} ${chapter}:${verse}`;
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

    const anchorVerse =
      parsed.verseStart ?? left.selectedVerses[0]?.verse ?? left.chapterVerses[0]?.verse;
    let previousReference: string | null = null;
    let nextReference: string | null = null;

    if (anchorVerse) {
      const currentIndex = left.chapterVerses.findIndex(
        (verse) => verse.verse === anchorVerse
      );
      if (currentIndex >= 0) {
        const previous = left.chapterVerses[currentIndex - 1];
        const next = left.chapterVerses[currentIndex + 1];
        previousReference = previous
          ? formatVerseReference(left.resolvedBook, parsed.chapter, previous.verse)
          : null;
        nextReference = next
          ? formatVerseReference(left.resolvedBook, parsed.chapter, next.verse)
          : null;
      }
    }

    return NextResponse.json({
      reference: left.resolvedReference,
      previousReference,
      nextReference,
      left: {
        translation: input.leftTranslation,
        translationName: getTranslationLabel(input.leftTranslation),
        text: leftText,
        segments: diff.left
      },
      right: {
        translation: input.rightTranslation,
        translationName: getTranslationLabel(input.rightTranslation),
        text: rightText,
        segments: diff.right
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
