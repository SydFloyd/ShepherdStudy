import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { listStudyThreads, toThreadSummary } from "@/lib/study-history";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const createThreadSchema = z.object({
  title: z.string().trim().max(120).optional().or(z.literal("")),
  translation: z.string().trim().max(24).optional().or(z.literal(""))
});

export async function GET() {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/study/threads",
    method: "GET"
  });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    logEvent("warn", "study_threads.unauthorized", requestMeta);
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const threads = await listStudyThreads(session.user.id);
  logEvent("info", "study_threads.list_ok", {
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
    route: "/api/study/threads",
    method: req.method
  });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    logEvent("warn", "study_threads.unauthorized", requestMeta);
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const payload = createThreadSchema.parse(await req.json());
    const thread = await prisma.studyThread.create({
      data: {
        userId: session.user.id,
        title: payload.title?.trim() || "Untitled Study",
        translation: payload.translation?.trim() || null
      }
    });

    logEvent("info", "study_threads.create_ok", {
      ...requestMeta,
      userId: session.user.id
    });
    return NextResponse.json({ thread: toThreadSummary(thread) }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logEvent("warn", "study_threads.invalid_input", requestMeta);
      return NextResponse.json({ error: "Invalid thread payload." }, { status: 400 });
    }
    captureServerException(error, {
      route: "/api/study/threads",
      requestId
    });
    logEvent("error", "study_threads.create_failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to create study thread." },
      { status: 500 }
    );
  }
}
