import { NextResponse } from "next/server";

import { verifyEmailWithToken } from "@/lib/account-tokens";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

function redirect(request: Request, pathname: string, key: string, value: string) {
  const target = new URL(pathname, request.url);
  target.searchParams.set(key, value);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function GET(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/auth/verify-email",
    method: request.method
  });

  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const verified = await verifyEmailWithToken(token);
    if (!verified) {
      logEvent("warn", "auth.email_verification_invalid", requestMeta);
      return redirect(request, "/verify-email", "error", "invalid");
    }

    logEvent("info", "auth.email_verification_ok", requestMeta);
    return redirect(request, "/login", "verified", "1");
  } catch (error) {
    captureServerException(error, {
      route: "/api/auth/verify-email",
      requestId
    });
    logEvent("error", "auth.email_verification_failure", {
      ...requestMeta,
      error
    });
    return redirect(request, "/verify-email", "error", "unavailable");
  }
}
