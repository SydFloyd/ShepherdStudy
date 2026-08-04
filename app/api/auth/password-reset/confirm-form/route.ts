import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { resetPasswordWithToken } from "@/lib/account-tokens";
import { consumePasswordResetConfirmationRateLimit } from "@/lib/auth-rate-limit";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { readUrlEncodedBody } from "@/lib/request-body";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

function redirect(
  request: Request,
  pathname: string,
  key: string,
  value: string,
  token?: string,
  retryAfterSeconds?: number
) {
  const target = new URL(pathname, request.url);
  target.searchParams.set(key, value);
  if (token) {
    target.searchParams.set("token", token);
  }
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  if (retryAfterSeconds) {
    response.headers.set("Retry-After", String(retryAfterSeconds));
  }
  return response;
}

export async function POST(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/auth/password-reset/confirm-form",
    method: request.method
  });

  try {
    const form = await readUrlEncodedBody(request);
    const token = String(form.get("token") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmPassword") ?? "");

    if (password.length < 8 || password.length > 128) {
      return redirect(
        request,
        "/reset-password",
        "error",
        "invalid_password",
        token
      );
    }
    if (password !== confirmation) {
      return redirect(
        request,
        "/reset-password",
        "error",
        "password_mismatch",
        token
      );
    }

    const rateLimit = await consumePasswordResetConfirmationRateLimit({
      request,
      token: token || "missing"
    });
    if (!rateLimit.allowed) {
      logEvent("warn", "auth.password_reset_confirmation_rate_limited", {
        ...requestMeta,
        scope: rateLimit.scope,
        retryAfterSeconds: rateLimit.retryAfterSeconds
      });
      return redirect(
        request,
        "/reset-password",
        "error",
        "invalid",
        undefined,
        rateLimit.retryAfterSeconds
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const reset = await resetPasswordWithToken({ token, passwordHash });
    if (!reset) {
      logEvent("warn", "auth.password_reset_invalid", requestMeta);
      return redirect(request, "/reset-password", "error", "invalid");
    }

    logEvent("info", "auth.password_reset_ok", requestMeta);
    return redirect(request, "/login", "reset", "1");
  } catch (error) {
    captureServerException(error, {
      route: "/api/auth/password-reset/confirm-form",
      requestId
    });
    logEvent("error", "auth.password_reset_failure", {
      ...requestMeta,
      error
    });
    return redirect(request, "/reset-password", "error", "invalid");
  }
}
