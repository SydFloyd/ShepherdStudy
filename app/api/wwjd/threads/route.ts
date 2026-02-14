import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { listWwjdThreads, toWwjdThreadSummary } from "@/lib/wwjd-history";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const createSchema = z.object({
  title: z.string().trim().min(1).max(120).optional()
});

export async function GET() {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/wwjd/threads",
    method: "GET"
  });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    logEvent("warn", "wwjd_threads.unauthorized", requestMeta);
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const threads = await listWwjdThreads(session.user.id);
  logEvent("info", "wwjd_threads.list_ok", {
    ...requestMeta,
    userId: session.user.id,
    count: threads.length
  });
  return NextResponse.json({ threads });
}

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/wwjd/threads",
    method: req.method
  });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    logEvent("warn", "wwjd_threads.unauthorized", requestMeta);
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const input = createSchema.parse(await req.json());
    const thread = await prisma.wwjdThread.create({
      data: {
        userId: session.user.id,
        title: input.title ?? "Untitled WWJD"
      }
    });
    logEvent("info", "wwjd_threads.create_ok", {
      ...requestMeta,
      userId: session.user.id
    });
    return NextResponse.json({ thread: toWwjdThreadSummary(thread) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logEvent("warn", "wwjd_threads.invalid_input", requestMeta);
      return NextResponse.json({ error: "Invalid WWJD thread payload." }, { status: 400 });
    }
    captureServerException(error, {
      route: "/api/wwjd/threads",
      requestId
    });
    logEvent("error", "wwjd_threads.create_failure", { ...requestMeta, error });
    return NextResponse.json({ error: "Unable to create WWJD thread." }, { status: 500 });
  }
}
