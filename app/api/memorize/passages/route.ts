import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { consumeDbsReadRateLimit } from "@/lib/auth-rate-limit";
import { bibleTranslationIdSchema, isDbsTranslation } from "@/lib/bible";
import {
  BibleProviderError,
  bibleProviderErrorResponse
} from "@/lib/bible-provider-error";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { EsvDisplayBudget } from "@/lib/esv-compliance";
import {
  resolveMemorizationPassage,
  serializeMemorizationPassage,
  toMemorizationStorageData
} from "@/lib/memorization-data";
import { prisma } from "@/lib/prisma";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/request-body";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const MAX_SAVED_PASSAGES = 200;

const createSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  translation: bibleTranslationIdSchema
});

const deleteSchema = z.object({
  passageId: z.string().trim().cuid()
});

export async function POST(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/memorize/passages",
    method: request.method
  });

  try {
    const session = await getServerSession(authOptions);
    const input = createSchema.parse(await readJsonBody(request));
    const userId = session?.user?.id;

    if (userId) {
      const savedCount = await prisma.memorizationPassage.count({
        where: { userId }
      });
      if (savedCount >= MAX_SAVED_PASSAGES) {
        return NextResponse.json(
          {
            error: `You can save up to ${MAX_SAVED_PASSAGES} memorization passages.`
          },
          { status: 409 }
        );
      }
    }

    if (isDbsTranslation(input.translation)) {
      const rateLimit = await consumeDbsReadRateLimit({
        headers: request.headers
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

    const resolution = await resolveMemorizationPassage(input);
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.message }, { status: 400 });
    }

    if (!userId) {
      const now = new Date();
      const passage = serializeMemorizationPassage({
        ...resolution.passage,
        id: `guest-${randomUUID()}`,
        textAttemptCount: 0,
        latestTextScore: null,
        bestTextScore: null,
        referenceAttemptCount: 0,
        latestReferenceScore: null,
        bestReferenceScore: null,
        lastPracticedAt: null,
        createdAt: now,
        updatedAt: now
      });
      logEvent("info", "memorize.guest_passage_resolved", requestMeta);
      const response = NextResponse.json(
        { passage, temporary: true },
        { status: 201 }
      );
      response.headers.set("Cache-Control", "no-store");
      return response;
    }

    const storageData = {
      userId,
      ...toMemorizationStorageData(resolution.passage)
    };
    const created =
      resolution.passage.editionSnapshot.provider === "esv"
        ? await prisma.$transaction(async (transaction) => {
            await transaction.$queryRaw`
              SELECT pg_advisory_xact_lock(8220047002)::text AS "lock"
            `;
            const savedEsvPassages =
              await transaction.memorizationPassage.findMany({
                where: { userId, translation: "esv" },
                select: {
                  bookOrder: true,
                  verseStart: true,
                  verseEnd: true
                }
              });
            const displayBudget = new EsvDisplayBudget((bookOrder) =>
              transaction.bibleVerse.count({
                where: { translation: "web", bookOrder }
              })
            );
            for (const passage of savedEsvPassages) {
              await displayBudget.assert({
                bookOrder: passage.bookOrder,
                verseCount: passage.verseEnd - passage.verseStart + 1
              });
            }
            await displayBudget.assert({
              bookOrder: resolution.passage.bookOrder,
              verseCount:
                resolution.passage.verseEnd - resolution.passage.verseStart + 1
            });
            return transaction.memorizationPassage.create({
              data: storageData
            });
          })
        : await prisma.memorizationPassage.create({ data: storageData });

    logEvent("info", "memorize.passage_created", requestMeta);
    return NextResponse.json(
      {
        passage: serializeMemorizationPassage({
          ...created,
          text: resolution.passage.text,
          verses: resolution.passage.verses,
          editionSnapshot: resolution.passage.editionSnapshot
        })
      },
      { status: 201 }
    );
  } catch (error) {
    const bodyErrorResponse = requestBodyErrorResponse(error);
    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Enter a valid passage and translation." },
        { status: 400 }
      );
    }
    if (error instanceof BibleProviderError) {
      return bibleProviderErrorResponse(error);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "That passage is already in your memorization list." },
        { status: 409 }
      );
    }

    captureServerException(error, {
      route: "/api/memorize/passages",
      requestId
    });
    logEvent("error", "memorize.passage_create_failed", {
      ...requestMeta,
      error
    });
    return NextResponse.json(
      { error: "Unable to save that passage right now." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/memorize/passages",
    method: request.method
  });

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const input = deleteSchema.parse(await readJsonBody(request));
    const result = await prisma.memorizationPassage.deleteMany({
      where: { id: input.passageId, userId: session.user.id }
    });
    if (result.count === 0) {
      return NextResponse.json({ error: "Passage not found." }, { status: 404 });
    }

    logEvent("info", "memorize.passage_deleted", requestMeta);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const bodyErrorResponse = requestBodyErrorResponse(error);
    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid passage deletion request." },
        { status: 400 }
      );
    }

    captureServerException(error, {
      route: "/api/memorize/passages",
      requestId
    });
    logEvent("error", "memorize.passage_delete_failed", {
      ...requestMeta,
      error
    });
    return NextResponse.json(
      { error: "Unable to remove that passage right now." },
      { status: 500 }
    );
  }
}
