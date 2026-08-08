import { NextResponse } from "next/server";
import { z } from "zod";

import {
  bibleTranslationIdSchema,
  DEFAULT_BIBLE_TRANSLATION,
  isDbsTranslation
} from "@/lib/bible";
import { resolvePassageFromBible } from "@/lib/bible-provider";
import {
  BibleProviderError,
  bibleProviderErrorResponse
} from "@/lib/bible-provider-error";
import { consumeDbsReadRateLimit } from "@/lib/auth-rate-limit";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/request-body";
import { captureServerException } from "@/lib/sentry";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  translation: bibleTranslationIdSchema.default(DEFAULT_BIBLE_TRANSLATION)
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
    const json = await readJsonBody(req);
    const input = inputSchema.parse(json);

    if (isDbsTranslation(input.translation)) {
      const rateLimit = await consumeDbsReadRateLimit({
        headers: req.headers
      });
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { error: "Too many Bible text requests. Please wait and retry." },
          {
            status: 429,
            headers: {
              "Retry-After": String(rateLimit.retryAfterSeconds)
            }
          }
        );
      }
    }

    const resolution = await resolvePassageFromBible({
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
      reference: resolution.resolvedReference,
      chapterReference: resolution.chapterReference,
      translation: resolution.source.translation,
      translationName: resolution.translationName,
      source: resolution.source,
      verses,
      chapterPath: resolution.chapterPath,
      excerpted: !resolution.parsed.verseStart
    });
  } catch (error) {
    const bodyErrorResponse = requestBodyErrorResponse(error);
    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }

    if (error instanceof z.ZodError) {
      logEvent("warn", "passage_preview.invalid_input", requestMeta);
      return NextResponse.json(
        { error: "Invalid passage preview request." },
        { status: 400 }
      );
    }

    if (error instanceof BibleProviderError) {
      return bibleProviderErrorResponse(error);
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
