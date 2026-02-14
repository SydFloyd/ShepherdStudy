import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { persistWwjdTurn } from "@/lib/wwjd-history";
import { StudyRecommendation } from "@/lib/study-contract";

const appendSchema = z.object({
  userMessage: z.string().trim().min(1).max(4000),
  reply: z.string().trim().min(1).max(6000),
  recommendations: z.array(
    z.object({
      reference: z.string().min(1),
      reason: z.string().min(1),
      application: z.string().min(1),
      confidence: z.number().min(0).max(1)
    })
  )
});

type Params = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function POST(req: Request, context: Params) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/wwjd/threads/[threadId]/messages",
    method: req.method
  });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    logEvent("warn", "wwjd_thread_messages.unauthorized", requestMeta);
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const input = appendSchema.parse(await req.json());
    const { threadId } = await context.params;
    const thread = await persistWwjdTurn({
      userId: session.user.id,
      threadId,
      userMessage: input.userMessage,
      reply: input.reply,
      recommendations: input.recommendations as StudyRecommendation[]
    });
    logEvent("info", "wwjd_thread_messages.append_ok", {
      ...requestMeta,
      userId: session.user.id
    });
    return NextResponse.json({ thread });
  } catch (error) {
    captureServerException(error, {
      route: "/api/wwjd/threads/[threadId]/messages",
      requestId
    });
    logEvent("error", "wwjd_thread_messages.append_failure", {
      ...requestMeta,
      error
    });
    return NextResponse.json(
      { error: "Unable to append WWJD message." },
      { status: 500 }
    );
  }
}
