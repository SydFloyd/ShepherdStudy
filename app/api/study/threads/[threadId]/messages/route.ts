import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { studyResponsePayloadSchema } from "@/lib/persistence-schemas";
import { getRequestId } from "@/lib/request-context";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/request-body";
import { captureServerException } from "@/lib/sentry";
import { persistStudyTurn } from "@/lib/study-history";

const appendSchema = z.object({
  kind: z.enum(["prompt", "verse"]),
  userText: z.string().trim().min(1).max(4000),
  passage: z.string().trim().max(120).optional().or(z.literal("")),
  passages: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  translation: z.string().trim().min(1).max(24),
  response: studyResponsePayloadSchema
}).strict();

type Params = {
  params: Promise<{
    threadId: string;
  }>;
};

export async function POST(req: Request, context: Params) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/study/threads/[threadId]/messages",
    method: req.method
  });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    logEvent("warn", "study_thread_messages.unauthorized", requestMeta);
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    const input = appendSchema.parse(await readJsonBody(req));
    const { threadId } = await context.params;
    const thread = await persistStudyTurn({
      userId: session.user.id,
      threadId,
      kind: input.kind,
      userText: input.userText,
      passage: input.passage?.trim() || undefined,
      passages: input.passages,
      translation: input.translation,
      response: input.response
    });
    logEvent("info", "study_thread_messages.append_ok", {
      ...requestMeta,
      userId: session.user.id
    });
    return NextResponse.json({ thread });
  } catch (error) {
    const bodyErrorResponse = requestBodyErrorResponse(error);
    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid study message." },
        { status: 400 }
      );
    }

    captureServerException(error, {
      route: "/api/study/threads/[threadId]/messages",
      requestId
    });
    logEvent("error", "study_thread_messages.append_failure", {
      ...requestMeta,
      error
    });
    return NextResponse.json(
      { error: "Unable to append study message." },
      { status: 500 }
    );
  }
}
