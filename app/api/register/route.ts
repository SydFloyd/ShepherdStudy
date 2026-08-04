import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { consumeRegistrationRateLimit } from "@/lib/auth-rate-limit";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { readJsonBody, requestBodyErrorResponse } from "@/lib/request-body";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { verifyTurnstile } from "@/lib/turnstile";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  email: z.string().trim().max(254).email(),
  password: z.string().min(8).max(128),
  turnstileToken: z.string().min(1).max(2048)
});

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/register",
    method: req.method
  });

  try {
    logEvent("info", "register.start", requestMeta);
    const body = await readJsonBody(req, 16 * 1024);
    const input = registerSchema.parse(body);
    const email = input.email.normalize("NFKC").toLowerCase();

    const verification = await verifyTurnstile(req, input.turnstileToken);
    if (!verification.success) {
      logEvent("warn", "register.turnstile_rejected", {
        ...requestMeta,
        reason: verification.reason
      });
      return NextResponse.json(
        { error: "Verification failed. Please try again." },
        { status: 403 }
      );
    }

    const rateLimit = await consumeRegistrationRateLimit({
      request: req,
      normalizedEmail: email
    });
    if (!rateLimit.allowed) {
      logEvent("warn", "register.rate_limited", {
        ...requestMeta,
        scope: rateLimit.scope,
        retryAfterSeconds: rateLimit.retryAfterSeconds
      });
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfterSeconds) }
        }
      );
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      logEvent("warn", "register.exists", requestMeta);
      return NextResponse.json(
        { error: "Email is already registered." },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    await prisma.user.create({
      data: {
        name: input.name?.trim() ? input.name.trim() : null,
        email,
        passwordHash
      }
    });

    logEvent("info", "register.ok", requestMeta);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const bodyErrorResponse = requestBodyErrorResponse(error);
    if (bodyErrorResponse) {
      return bodyErrorResponse;
    }

    if (error instanceof z.ZodError) {
      logEvent("warn", "register.invalid_input", requestMeta);
      return NextResponse.json(
        { error: "Invalid registration input." },
        { status: 400 }
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      logEvent("warn", "register.exists", requestMeta);
      return NextResponse.json(
        { error: "Email is already registered." },
        { status: 409 }
      );
    }

    captureServerException(error, {
      route: "/api/register",
      requestId
    });
    logEvent("error", "register.failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unexpected error creating account." },
      { status: 500 }
    );
  }
}
