import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";

export async function GET(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/auth/debug",
    method: req.method
  });

  const url = new URL(req.url);
  const adminKey = req.headers.get("x-admin-key") ?? url.searchParams.get("key");
  if (!adminKey || adminKey !== process.env.ADMIN_METRICS_KEY) {
    logEvent("warn", "auth_debug.unauthorized", requestMeta);
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const session = await getServerSession(authOptions);
  const cookieHeader = req.headers.get("cookie") ?? "";
  const host = req.headers.get("host");
  const forwardedHost = req.headers.get("x-forwarded-host");
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  return NextResponse.json({
    ok: true,
    host,
    forwardedHost,
    userAgent,
    hasSession: Boolean(session?.user?.id),
    sessionUserId: session?.user?.id ?? null,
    hasSessionCookie:
      cookieHeader.includes("next-auth.session-token") ||
      cookieHeader.includes("__Secure-next-auth.session-token"),
    hasCsrfCookie:
      cookieHeader.includes("next-auth.csrf-token") ||
      cookieHeader.includes("__Host-next-auth.csrf-token")
  });
}
