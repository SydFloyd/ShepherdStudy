import { z } from "zod";

import { sendPasswordResetEmail } from "@/lib/account-email";
import {
  PostmarkConfigurationError,
  PostmarkDeliveryError
} from "@/lib/postmark";
import { prisma } from "@/lib/prisma";
import {
  readJsonBody,
  requestBodyErrorResponse
} from "@/lib/request-body";
import { getBearerToken, safeEqualSecret } from "@/lib/secret-auth";

const PRIVATE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
} as const;

const inputSchema = z.object({
  email: z.string().trim().email().max(254)
});

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const candidate = getBearerToken(request);
  return Boolean(
    expected &&
      expected.length >= 16 &&
      candidate &&
      safeEqualSecret(candidate, expected)
  );
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { error: "Unauthorized." },
      { status: 401, headers: PRIVATE_HEADERS }
    );
  }

  try {
    const parsed = inputSchema.safeParse(await readJsonBody(request, 4 * 1024));
    if (!parsed.success) {
      return Response.json(
        { error: "Invalid input." },
        { status: 400, headers: PRIVATE_HEADERS }
      );
    }

    const email = parsed.data.email.normalize("NFKC").toLowerCase();
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return Response.json(
        { error: "Account not found." },
        { status: 404, headers: PRIVATE_HEADERS }
      );
    }

    const delivery = await sendPasswordResetEmail(user);
    return Response.json(
      { ok: true, messageIdPresent: Boolean(delivery.messageId) },
      { headers: PRIVATE_HEADERS }
    );
  } catch (error) {
    const body =
      error instanceof PostmarkConfigurationError
        ? { ok: false, failure: "configuration" }
        : error instanceof PostmarkDeliveryError
          ? {
              ok: false,
              failure: "delivery",
              postmarkStatus: error.status,
              postmarkErrorCode: error.errorCode ?? null
            }
          : { ok: false, failure: "unexpected" };

    const requestBodyError = requestBodyErrorResponse(error);
    if (requestBodyError) {
      return requestBodyError;
    }
    return Response.json(body, { status: 502, headers: PRIVATE_HEADERS });
  }
}
