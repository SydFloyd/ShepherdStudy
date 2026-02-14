import { NextResponse } from "next/server";
import { z } from "zod";

import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { resolvePassageFromLocalBible } from "@/lib/local-bible";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  translation: z.enum(BIBLE_TRANSLATION_IDS).default(DEFAULT_BIBLE_TRANSLATION)
});

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/passage-preview",
    method: req.method
  });

  try {
    logEvent("info", "passage_preview.start", requestMeta);
    const json = await req.json();
    const input = inputSchema.parse(json);

    const resolution = await resolvePassageFromLocalBible({
      reference: input.reference,
      translation: input.translation
    });

    if (!resolution.ok) {
      logEvent("warn", "passage_preview.not_found", requestMeta);
      return NextResponse.json({ error: resolution.message }, { status: 404 });
    }

    const verses = resolution.parsed.verseStart
      ? resolution.selectedVerses
      : resolution.chapterVerses.slice(0, 24);

    logEvent("info", "passage_preview.ok", requestMeta);
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
      logEvent("warn", "passage_preview.invalid_input", requestMeta);
      return NextResponse.json(
        { error: "Invalid passage preview request." },
        { status: 400 }
      );
    }

    captureServerException(error, {
      route: "/api/passage-preview",
      requestId
    });
    logEvent("error", "passage_preview.failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to load passage preview right now." },
      { status: 500 }
    );
  }
}
