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
import {
  EsvDisplayBudget,
  toEsvDisplaySelection
} from "@/lib/esv-compliance";
import { prisma } from "@/lib/prisma";
import { isPrismaDatabaseUnavailableError } from "@/lib/prisma-errors";
import { getRequestId } from "@/lib/request-context";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/request-body";
import { parseScriptureReference } from "@/lib/scripture";
import { trackUsageSuccess } from "@/lib/usage-tracking";

const inputSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  leftTranslation: bibleTranslationIdSchema.default(DEFAULT_BIBLE_TRANSLATION),
  rightTranslation: bibleTranslationIdSchema.default("kjv")
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
  const requestId = await getRequestId();

  try {
    const input = inputSchema.parse(await readJsonBody(req));
    const parsed = parseScriptureReference(input.reference);
    if (!parsed) {
      return NextResponse.json(
        { error: "Please provide a valid reference (example: John 3:16)." },
        { status: 400 }
      );
    }

    if (
      isDbsTranslation(input.leftTranslation) ||
      isDbsTranslation(input.rightTranslation)
    ) {
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

    const [left, right] = await Promise.all([
      resolvePassageFromBible({
        reference: input.reference,
        translation: input.leftTranslation
      }),
      resolvePassageFromBible({
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

    const esvDisplayBudget = new EsvDisplayBudget();
    await esvDisplayBudget.assert(
      toEsvDisplaySelection({
        translation: left.source.translation,
        source: left.source,
        reference: left.resolvedReference,
        verses: left.selectedVerses
      })
    );
    await esvDisplayBudget.assert(
      toEsvDisplaySelection({
        translation: right.source.translation,
        source: right.source,
        reference: right.resolvedReference,
        verses: right.selectedVerses
      })
    );

    const { previousReference, nextReference } =
      await getAdjacentChapterReferences({
        translation:
          left.source.provider === "local" ? input.leftTranslation : "web",
        book: left.resolvedBook,
        chapter: parsed.chapter
      });

    await trackUsageSuccess({
      request: req,
      feature: "COMPARE",
      pagePath: "/compare",
      apiRoute: "/api/verse-compare",
      action: "compare",
      requestId
    });

    return NextResponse.json({
      reference: left.resolvedReference,
      previousReference,
      nextReference,
      left: {
        translation: left.source.translation,
        translationName: left.translationName,
        source: left.source,
        verses: left.selectedVerses.map((item) => ({
          verse: item.verse,
          paragraph: item.paragraph,
          text: item.text.trim()
        }))
      },
      right: {
        translation: right.source.translation,
        translationName: right.translationName,
        source: right.source,
        verses: right.selectedVerses.map((item) => ({
          verse: item.verse,
          paragraph: item.paragraph,
          text: item.text.trim()
        }))
      }
    });
  } catch (error) {
    const bodyErrorResponse = requestBodyErrorResponse(error);
    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid verse comparison request." },
        { status: 400 }
      );
    }
    if (error instanceof BibleProviderError) {
      return bibleProviderErrorResponse(error);
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
