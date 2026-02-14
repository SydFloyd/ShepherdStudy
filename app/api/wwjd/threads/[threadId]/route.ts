import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { getWwjdThreadDetail, toWwjdThreadSummary } from "@/lib/wwjd-history";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const patchSchema = z
  .object({
    archive: z.boolean().optional(),
    title: z.string().trim().min(1).max(120).optional()
  })
  .refine((value) => value.archive !== undefined || value.title !== undefined, {
    message: "At least one update field is required."
  });

type Params = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function GET(_: Request, context: Params) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/wwjd/threads/[threadId]",
    method: "GET"
  });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    logEvent("warn", "wwjd_thread.unauthorized", requestMeta);
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { threadId } = await context.params;
  const detail = await getWwjdThreadDetail({
    userId: session.user.id,
    threadId
  });

  if (!detail) {
    logEvent("warn", "wwjd_thread.not_found", {
      ...requestMeta,
      userId: session.user.id
    });
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  logEvent("info", "wwjd_thread.get_ok", { ...requestMeta, userId: session.user.id });
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, context: Params) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/wwjd/threads/[threadId]",
    method: req.method
  });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    logEvent("warn", "wwjd_thread.unauthorized", requestMeta);
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const input = patchSchema.parse(await req.json());
    const { threadId } = await context.params;
    const existing = await prisma.wwjdThread.findFirst({
      where: { id: threadId, userId: session.user.id }
    });

    if (!existing) {
      logEvent("warn", "wwjd_thread.not_found", {
        ...requestMeta,
        userId: session.user.id
      });
      return NextResponse.json({ error: "Thread not found." }, { status: 404 });
    }

    const thread = await prisma.wwjdThread.update({
      where: { id: threadId },
      data: {
        archivedAt:
          input.archive === undefined
            ? undefined
            : input.archive
              ? new Date()
              : null,
        title: input.title ?? undefined
      }
    });

    logEvent("info", "wwjd_thread.patch_ok", { ...requestMeta, userId: session.user.id });
    return NextResponse.json({ thread: toWwjdThreadSummary(thread) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logEvent("warn", "wwjd_thread.invalid_input", requestMeta);
      return NextResponse.json({ error: "Invalid patch payload." }, { status: 400 });
    }
    captureServerException(error, {
      route: "/api/wwjd/threads/[threadId]",
      requestId
    });
    logEvent("error", "wwjd_thread.patch_failure", { ...requestMeta, error });
    return NextResponse.json({ error: "Unable to update thread." }, { status: 500 });
  }
}
