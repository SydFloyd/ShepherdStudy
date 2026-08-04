import { NextResponse } from "next/server";

import { consumeDonationCheckoutRateLimit } from "@/lib/auth-rate-limit";
import {
  getDonationOrigin,
  parseDonationAmount
} from "@/lib/donations";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { readUrlEncodedBody, RequestBodyError } from "@/lib/request-body";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { createDonationCheckoutSession } from "@/lib/stripe";

const MAX_FORM_BYTES = 4 * 1024;

function donationRedirect(
  request: Request,
  state: "invalid" | "rate_limited" | "unavailable"
) {
  const target = new URL("/donate", getDonationOrigin(request.url));
  target.searchParams.set("error", state);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/donations/checkout",
    method: request.method
  });

  try {
    const form = await readUrlEncodedBody(request, MAX_FORM_BYTES);
    const amountCents = parseDonationAmount(String(form.get("amount") ?? ""));
    if (amountCents === null) {
      return donationRedirect(request, "invalid");
    }

    const rateLimit = await consumeDonationCheckoutRateLimit({ request });
    if (!rateLimit.allowed) {
      logEvent("warn", "donation_checkout.rate_limited", {
        ...requestMeta,
        retryAfterSeconds: rateLimit.retryAfterSeconds
      });
      const response = donationRedirect(request, "rate_limited");
      response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
      return response;
    }

    const origin = getDonationOrigin(request.url);
    const checkoutUrl = await createDonationCheckoutSession({
      amountCents,
      origin,
      requestId
    });
    logEvent("info", "donation_checkout.created", requestMeta);
    const response = NextResponse.redirect(checkoutUrl, 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return donationRedirect(request, "invalid");
    }

    captureServerException(error, {
      route: "/api/donations/checkout",
      requestId
    });
    logEvent("error", "donation_checkout.failure", {
      ...requestMeta,
      error
    });
    return donationRedirect(request, "unavailable");
  }
}
