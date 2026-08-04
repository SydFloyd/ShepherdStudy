import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { MEMORIZATION_TRANSLATION_IDS } from "@/lib/bible";
import { getRequestMeta, logEvent } from "@/lib/logger";
import {
  resolveMemorizationPassage,
  serializeMemorizationPassage
} from "@/lib/memorization-data";
import { prisma } from "@/lib/prisma";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/request-body";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const MAX_SAVED_PASSAGES = 200;

const createSchema = z.object({
  reference: z.string().trim().min(1).max(120),
  translation: z.enum(MEMORIZATION_TRANSLATION_IDS)
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
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const input = createSchema.parse(await readJsonBody(request));
    const savedCount = await prisma.memorizationPassage.count({
      where: { userId: session.user.id }
    });
    if (savedCount >= MAX_SAVED_PASSAGES) {
      return NextResponse.json(
        {
          error: `You can save up to ${MAX_SAVED_PASSAGES} memorization passages.`
        },
        { status: 409 }
      );
    }

    const resolution = await resolveMemorizationPassage(input);
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.message }, { status: 400 });
    }

    const created = await prisma.memorizationPassage.create({
      data: {
        userId: session.user.id,
        ...resolution.passage
      }
    });

    logEvent("info", "memorize.passage_created", requestMeta);
    return NextResponse.json(
      { passage: serializeMemorizationPassage(created) },
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
