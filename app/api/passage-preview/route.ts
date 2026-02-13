import { NextResponse } from "next/server";
import { z } from "zod";

import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { resolvePassageFromLocalBible } from "@/lib/local-bible";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  translation: z.enum(BIBLE_TRANSLATION_IDS).default(DEFAULT_BIBLE_TRANSLATION)
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = inputSchema.parse(json);

    const resolution = await resolvePassageFromLocalBible({
      reference: input.reference,
      translation: input.translation
    });

    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.message }, { status: 404 });
    }

    const verses = resolution.parsed.verseStart
      ? resolution.selectedVerses
      : resolution.chapterVerses.slice(0, 24);

    return NextResponse.json({
      reference: input.reference,
      chapterReference: resolution.chapterReference,
      translation: input.translation,
      translationName: resolution.translationName,
      verses,
      chapterPath: resolution.chapterPath,
      excerpted: !resolution.parsed.verseStart
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid passage preview request." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unable to load passage preview right now." },
      { status: 500 }
    );
  }
}
