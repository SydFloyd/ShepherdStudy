import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { consumeQuota } from "@/lib/quota";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { buildWordAnalyticsPayload } from "@/lib/word-analytics";

const inputSchema = z.object({
  query: z.string().trim().min(1).max(120),
  sourceTranslation: z.enum(["ugnt", "uhb"]).optional(),
  book: z.string().trim().min(1).max(60).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(10).max(100).optional()
});

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/word-analytics",
    method: req.method
  });

  try {
    const input = inputSchema.parse(await req.json());
    const session = await getServerSession(authOptions);
    const quotaDecision = await consumeQuota({
      request: req,
      userId: session?.user?.id,
      feature: "INTERLINEAR"
    });
    if (!quotaDecision.allowed) {
      return NextResponse.json(
        {
          error:
            quotaDecision.reason === "daily_limit"
              ? "Daily interlinear limit reached. Please try again tomorrow."
              : "Too many interlinear requests in a short period. Please wait and retry.",
          quota: quotaDecision
        },
        {
          status: 429,
          headers: { "Retry-After": String(quotaDecision.retryAfterSeconds) }
        }
      );
    }

    const payload = await buildWordAnalyticsPayload({
      query: input.query,
      sourceTranslation: input.sourceTranslation,
      book: input.book,
      page: input.page,
      pageSize: input.pageSize
    });
    if (!payload) {
      return NextResponse.json(
        { error: "No lemma/Strong match found for this query." },
        { status: 404 }
      );
    }

    logEvent("info", "word_analytics.ok", {
      ...requestMeta,
      query: payload.query.input,
      resolvedStrong: payload.query.resolvedStrong,
      sourceTranslation: payload.query.sourceTranslation,
      totalBooks: payload.bookStats.length,
      totalOccurrences: payload.occurrences.total
    });

    return NextResponse.json({
      ...payload,
      quota: quotaDecision
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid word analytics request." },
        { status: 400 }
      );
    }
    captureServerException(error, {
      route: "/api/word-analytics",
      requestId
    });
    logEvent("error", "word_analytics.failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to build word analytics right now." },
      { status: 500 }
    );
  }
}

