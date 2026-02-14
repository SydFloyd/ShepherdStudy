import { NextResponse } from "next/server";

import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

export async function GET(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/health",
    method: req.method
  });

  const startedAt = Date.now();
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    const payload = {
      ok: true,
      service: "shepherd-study",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        db: "ok",
        openaiKey: Boolean(process.env.OPENAI_API_KEY),
        sentryConfigured: Boolean(process.env.SENTRY_DSN)
      },
      latencyMs: Date.now() - startedAt
    };
    logEvent("info", "health.ok", requestMeta);
    return NextResponse.json(payload);
  } catch (error) {
    captureServerException(error, {
      route: "/api/health",
      requestId
    });
    logEvent("error", "health.failure", { ...requestMeta, error });
    return NextResponse.json(
      {
        ok: false,
        service: "shepherd-study",
        timestamp: new Date().toISOString(),
        checks: {
          db: "error"
        }
      },
      { status: 503 }
    );
  }
}
