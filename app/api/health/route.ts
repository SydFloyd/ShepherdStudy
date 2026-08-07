import { NextResponse } from "next/server";

import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { isTurnstileConfigured } from "@/lib/turnstile";

export async function GET(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/health",
    method: req.method
  });

  try {
    await prisma.$queryRaw`SELECT 1`;
    const payload = {
      ok: true,
      service: "shepherd-study",
      timestamp: new Date().toISOString(),
      checks: {
        db: "ok",
        turnstile: isTurnstileConfigured() ? "ok" : "error"
      }
    };
    logEvent("info", "health.ok", requestMeta);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
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
      {
        status: 503,
        headers: { "Cache-Control": "no-store, max-age=0" }
      }
    );
  }
}
