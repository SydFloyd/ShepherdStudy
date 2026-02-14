import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  email: z.string().email(),
  password: z.string().min(8).max(128)
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
    const body = await req.json();
    const input = registerSchema.parse(body);
    const email = input.email.toLowerCase();

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
    if (error instanceof z.ZodError) {
      logEvent("warn", "register.invalid_input", requestMeta);
      return NextResponse.json(
        { error: "Invalid registration input." },
        { status: 400 }
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
