import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getRequestId } from "@/lib/request-context";
import { captureServerException } from "@/lib/sentry";

const updateSchema = z.object({
  name: z.string().trim().max(80).optional(),
  currentPassword: z.string().min(1).max(128).optional(),
  newPassword: z.string().min(8).max(128).optional()
});

const deleteSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  confirm: z.literal("DELETE")
});

export async function GET(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/account",
    method: req.method
  });

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    return NextResponse.json({
      account: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString()
      }
    });
  } catch (error) {
    captureServerException(error, { route: "/api/account", requestId });
    logEvent("error", "account.get.failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to load account." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/account",
    method: req.method
  });

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const input = updateSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true }
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const nextName = input.name === undefined ? undefined : input.name.trim() || null;
    const wantsPasswordChange = Boolean(input.currentPassword || input.newPassword);

    if (wantsPasswordChange) {
      if (!input.currentPassword || !input.newPassword) {
        return NextResponse.json(
          { error: "Current password and new password are both required." },
          { status: 400 }
        );
      }

      const validPassword = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!validPassword) {
        return NextResponse.json(
          { error: "Current password is incorrect." },
          { status: 400 }
        );
      }
    }

    const data: { name?: string | null; passwordHash?: string } = {};
    if (input.name !== undefined) {
      data.name = nextName;
    }
    if (wantsPasswordChange && input.newPassword) {
      data.passwordHash = await bcrypt.hash(input.newPassword, 12);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true });
    }

    await prisma.user.update({
      where: { id: user.id },
      data
    });

    logEvent("info", "account.patch.ok", requestMeta);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid account update input." }, { status: 400 });
    }

    captureServerException(error, { route: "/api/account", requestId });
    logEvent("error", "account.patch.failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to update account." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/account",
    method: req.method
  });

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = await req.json();
    const input = deleteSchema.parse(body);

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, passwordHash: true }
    });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    const validPassword = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    await prisma.user.delete({ where: { id: user.id } });
    logEvent("info", "account.delete.ok", requestMeta);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid account deletion input." }, { status: 400 });
    }

    captureServerException(error, { route: "/api/account", requestId });
    logEvent("error", "account.delete.failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to delete account." },
      { status: 500 }
    );
  }
}
