import { NextResponse } from "next/server";

import { sendPasswordResetEmail } from "@/lib/account-email";
import { consumeAccountEmailRateLimit } from "@/lib/auth-rate-limit";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { readUrlEncodedBody } from "@/lib/request-body";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { PostmarkDeliveryError } from "@/lib/postmark";
import { verifyTurnstile } from "@/lib/turnstile";

function redirect(request: Request, key: string, value: string) {
  const target = new URL("/forgot-password", request.url);
  target.searchParams.set(key, value);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function POST(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/auth/password-reset/request-form",
    method: request.method
  });

  try {
    const form = await readUrlEncodedBody(request);
    const email = String(form.get("email") ?? "")
      .trim()
      .normalize("NFKC")
      .toLowerCase();
    const turnstileToken = String(form.get("cf-turnstile-response") ?? "");

    const verification = await verifyTurnstile(request, turnstileToken);
    if (!verification.success) {
      logEvent("warn", "auth.password_reset_turnstile_rejected", {
        ...requestMeta,
        reason: verification.reason
      });
      return redirect(request, "error", "verification");
    }

    if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/.test(email)) {
      return redirect(request, "sent", "1");
    }

    const rateLimit = await consumeAccountEmailRateLimit({
      request,
      normalizedEmail: email,
      action: "reset_password"
    });
    if (!rateLimit.allowed) {
      logEvent("warn", "auth.password_reset_rate_limited", {
        ...requestMeta,
        scope: rateLimit.scope,
        retryAfterSeconds: rateLimit.retryAfterSeconds
      });
      return redirect(request, "error", "rate_limited");
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      try {
        await sendPasswordResetEmail(user);
      } catch (error) {
        captureServerException(error, {
          route: "/api/auth/password-reset/request-form",
          requestId
        });
        logEvent("error", "auth.password_reset_delivery_failure", {
          ...requestMeta,
          postmarkStatus:
            error instanceof PostmarkDeliveryError ? error.status : undefined,
          postmarkErrorCode:
            error instanceof PostmarkDeliveryError
              ? error.errorCode
              : undefined,
          error
        });
      }
    }

    logEvent("info", "auth.password_reset_request_processed", requestMeta);
  } catch (error) {
    captureServerException(error, {
      route: "/api/auth/password-reset/request-form",
      requestId
    });
    logEvent("error", "auth.password_reset_request_failure", {
      ...requestMeta,
      error
    });
  }

  return redirect(request, "sent", "1");
}
