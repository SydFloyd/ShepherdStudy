import { MemorizationAttemptMode, Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { consumeMemorizationAttemptRateLimit } from "@/lib/auth-rate-limit";
import { getRequestMeta, logEvent } from "@/lib/logger";
import {
  assessReferenceRecall,
  serializeMemorizationPassage
} from "@/lib/memorization-data";
import { assessRecall } from "@/lib/memorization-recall";
import { prisma } from "@/lib/prisma";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/request-body";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const attemptSchema = z.object({
  passageId: z.string().trim().cuid(),
  mode: z.nativeEnum(MemorizationAttemptMode),
  response: z.string().max(50_000)
});

const MAX_TRANSACTION_ATTEMPTS = 5;

function isRetryableConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

async function persistAttempt(input: {
  passageId: string;
  userId: string;
  mode: MemorizationAttemptMode;
  score: number;
  wordCount: number;
}) {
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const current = await transaction.memorizationPassage.findFirst({
            where: { id: input.passageId, userId: input.userId }
          });
          if (!current) {
            return null;
          }

          const now = new Date();
          const updateData =
            input.mode === MemorizationAttemptMode.TEXT
              ? {
                  textAttemptCount: { increment: 1 },
                  latestTextScore: input.score,
                  bestTextScore: Math.max(
                    current.bestTextScore ?? 0,
                    input.score
                  ),
                  lastPracticedAt: now
                }
              : {
                  referenceAttemptCount: { increment: 1 },
                  latestReferenceScore: input.score,
                  bestReferenceScore: Math.max(
                    current.bestReferenceScore ?? 0,
                    input.score
                  ),
                  lastPracticedAt: now
                };

          await transaction.memorizationAttempt.create({
            data: {
              passageId: current.id,
              userId: input.userId,
              mode: input.mode,
              score: input.score,
              wordCount: input.wordCount
            }
          });
          return transaction.memorizationPassage.update({
            where: { id: current.id },
            data: updateData
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (
        !isRetryableConflict(error) ||
        attempt === MAX_TRANSACTION_ATTEMPTS - 1
      ) {
        throw error;
      }
    }
  }

  throw new Error("Unable to save memorization attempt.");
}

export async function POST(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/memorize/attempts",
    method: request.method
  });

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const input = attemptSchema.parse(await readJsonBody(request));
    const rateLimit = await consumeMemorizationAttemptRateLimit({
      request,
      userId: session.user.id
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many saved attempts. Please pause and try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const passage = await prisma.memorizationPassage.findFirst({
      where: { id: input.passageId, userId: session.user.id }
    });
    if (!passage) {
      return NextResponse.json({ error: "Passage not found." }, { status: 404 });
    }

    const assessment =
      input.mode === "TEXT"
        ? assessRecall(passage.text, input.response)
        : assessReferenceRecall(passage, input.response);
    const updated = await persistAttempt({
      passageId: passage.id,
      userId: session.user.id,
      mode: input.mode,
      score: assessment.score,
      wordCount: assessment.expectedWordCount
    });
    if (!updated) {
      return NextResponse.json({ error: "Passage not found." }, { status: 404 });
    }

    logEvent("info", "memorize.attempt_saved", {
      ...requestMeta,
      mode: input.mode,
      score: assessment.score
    });
    return NextResponse.json({
      assessment,
      passage: serializeMemorizationPassage(updated)
    });
  } catch (error) {
    const bodyErrorResponse = requestBodyErrorResponse(error);
    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid memorization attempt." },
        { status: 400 }
      );
    }
    if (error instanceof RangeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    captureServerException(error, {
      route: "/api/memorize/attempts",
      requestId
    });
    logEvent("error", "memorize.attempt_failed", {
      ...requestMeta,
      error
    });
    return NextResponse.json(
      { error: "Unable to assess that attempt right now." },
      { status: 500 }
    );
  }
}
