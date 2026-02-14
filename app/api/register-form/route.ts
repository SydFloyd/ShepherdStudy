import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

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
    const formData = await req.formData();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(formData.get("password") ?? "");

    if (!email || !email.includes("@") || password.length < 8) {
      return NextResponse.redirect(
        buildRegisterRedirect(req, "Invalid registration input.", { email, name }),
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
