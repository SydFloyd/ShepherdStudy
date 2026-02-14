import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";

const feedbackSchema = z.object({
  surface: z.enum(["study", "wwjd"]),
  vote: z.enum(["helpful", "not_helpful"]),
  threadId: z.string().cuid().optional(),
  itemId: z.string().min(1).max(120),
  note: z.string().max(500).optional()
});

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/feedback",
    method: req.method
  });

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const body = await req.json();
    const input = feedbackSchema.parse(body);

    logEvent("info", "feedback.submitted", {
      ...requestMeta,
      userId: session.user.id,
      surface: input.surface,
      vote: input.vote,
      threadId: input.threadId,
      itemId: input.itemId,
      note: input.note
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid feedback payload." }, { status: 400 });
  }
}
