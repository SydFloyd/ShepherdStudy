import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { getRequestMeta, logEvent } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";

export async function GET(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/sentry-test",
    method: req.method
  });

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "capture";

  if (mode === "throw") {
    logEvent("warn", "sentry_test.throw", requestMeta);
    throw new Error("Sentry throw smoke test");
  }

  const error = new Error("Sentry capture smoke test");
  const eventId = Sentry.withScope((scope) => {
    scope.setTag("route", "/api/sentry-test");
    scope.setTag("requestId", requestId);
    scope.setTag("mode", mode);
    return Sentry.captureException(error);
  });
  await Sentry.flush(2000);

  logEvent("info", "sentry_test.captured", requestMeta);

  return NextResponse.json({
    ok: true,
    message: "Sent test exception to Sentry.",
    eventId,
    diagnostics: {
      dsnConfigured: Boolean(process.env.SENTRY_DSN),
      env: process.env.NODE_ENV
    }
  });
}
