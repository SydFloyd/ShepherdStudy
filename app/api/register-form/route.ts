import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { readUrlEncodedBody, RequestBodyError } from "@/lib/request-body";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";
import { verifyTurnstile } from "@/lib/turnstile";

function getOrigin(req: Request) {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function buildRegisterRedirect(
  req: Request,
  error: string,
  fields?: { email?: string; name?: string }
) {
  const target = new URL("/register", getOrigin(req));
  target.searchParams.set("error", error);
  if (fields?.email) {
    target.searchParams.set("email", fields.email);
  }
  if (fields?.name) {
    target.searchParams.set("name", fields.name);
  }
  return target;
}

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/register-form",
    method: req.method
  });

  try {
    const formData = await readUrlEncodedBody(req);
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "")
      .trim()
      .normalize("NFKC")
      .toLowerCase();
    const password = String(formData.get("password") ?? "");
    const turnstileToken = String(
      formData.get("cf-turnstile-response") ?? ""
    );

    if (
      !email ||
      email.length > 254 ||
      !email.includes("@") ||
      name.length > 80 ||
      password.length < 8 ||
      password.length > 128
    ) {
      return NextResponse.redirect(
        buildRegisterRedirect(req, "Invalid registration input.", { email, name }),
        303
      );
    }

    const verification = await verifyTurnstile(req, turnstileToken);
    if (!verification.success) {
      logEvent("warn", "register_form.turnstile_rejected", {
        ...requestMeta,
        reason: verification.reason
      });
      return NextResponse.redirect(
        buildRegisterRedirect(
          req,
          "Verification failed. Please try again.",
          { email, name }
        ),
        303
      );
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.redirect(
        buildRegisterRedirect(req, "Email is already registered.", { email, name }),
        303
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        name: name ? name : null,
        email,
        passwordHash
      }
    });

    logEvent("info", "register_form.ok", requestMeta);
    const target = new URL("/login", getOrigin(req));
    target.searchParams.set("registered", "1");
    target.searchParams.set("email", email);
    return NextResponse.redirect(target, 303);
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.redirect(
        buildRegisterRedirect(req, error.message),
        303
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.redirect(
        buildRegisterRedirect(req, "Email is already registered."),
        303
      );
    }

    captureServerException(error, {
      route: "/api/register-form",
      requestId
    });
    logEvent("error", "register_form.failure", { ...requestMeta, error });
    return NextResponse.redirect(
      buildRegisterRedirect(req, "Unexpected error creating account."),
      303
    );
  }
}
