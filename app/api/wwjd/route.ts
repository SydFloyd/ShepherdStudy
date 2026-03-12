import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { consumeQuota } from "@/lib/quota";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { resolveActiveUserId } from "@/lib/session-user";
import { trackUsageSuccess } from "@/lib/usage-tracking";
import { generateWwjdResponse } from "@/lib/wwjd";
import { persistWwjdTurn } from "@/lib/wwjd-history";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000)
});

const inputSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z.array(messageSchema).max(20).default([]),
  threadId: z.string().trim().cuid().optional()
});

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/wwjd",
    method: req.method
  });

  try {
    logEvent("info", "wwjd.start", requestMeta);
    const json = await req.json();
    const input = inputSchema.parse(json);
    const session = await getServerSession(authOptions);
    const userId = await resolveActiveUserId(session?.user?.id);
    const quotaDecision = await consumeQuota({
      request: req,
      userId,
      feature: "WWJD"
    });

    if (!quotaDecision.allowed) {
      logEvent("warn", "wwjd.quota_block", {
        ...requestMeta,
        reason: quotaDecision.reason
      });
      return NextResponse.json(
        {
          error:
            quotaDecision.reason === "daily_limit"
              ? "Daily WWJD limit reached. Please try again tomorrow."
              : "Too many WWJD requests in a short period. Please wait and retry.",
          quota: quotaDecision
        },
        {
          status: 429,
          headers: { "Retry-After": String(quotaDecision.retryAfterSeconds) }
        }
      );
    }

    const response = await generateWwjdResponse({
      message: input.message,
      history: input.history
    });

    const thread =
      userId
        ? await persistWwjdTurn({
            userId,
            threadId: input.threadId,
            userMessage: input.message,
            reply: response.reply,
            recommendations: response.recommendations
          })
        : null;

    logEvent("info", "wwjd.ok", {
      ...requestMeta,
      recommendations: response.recommendations.length,
      saved: Boolean(thread)
    });

    await trackUsageSuccess({
      request: req,
      feature: "WWJD",
      pagePath: "/wwjd",
      apiRoute: "/api/wwjd",
      action: "submit",
      userId,
      requestId
    });

    return NextResponse.json({
      ...response,
      quota: quotaDecision,
      saved: Boolean(thread),
      thread
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      logEvent("warn", "wwjd.invalid_input", requestMeta);
      return NextResponse.json(
        { error: "Invalid WWJD input." },
        { status: 400 }
      );
    }

    captureServerException(error, {
      route: "/api/wwjd",
      requestId
    });
    logEvent("error", "wwjd.failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to generate WWJD response right now." },
      { status: 500 }
    );
  }
}
