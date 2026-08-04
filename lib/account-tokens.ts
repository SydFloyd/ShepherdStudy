import { createHash, randomBytes } from "node:crypto";

import { AccountTokenPurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;

export function hashAccountToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function tokenTtlMs(purpose: AccountTokenPurpose) {
  return purpose === AccountTokenPurpose.VERIFY_EMAIL
    ? VERIFY_EMAIL_TTL_MS
    : RESET_PASSWORD_TTL_MS;
}

export async function createAccountToken(
  userId: string,
  purpose: AccountTokenPurpose
) {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const record = await prisma.accountToken.create({
    data: {
      userId,
      purpose,
      tokenHash: hashAccountToken(token),
      expiresAt: new Date(Date.now() + tokenTtlMs(purpose))
    },
    select: { id: true }
  });

  return { id: record.id, token };
}

export async function revokeAccountToken(tokenId: string) {
  await prisma.accountToken.deleteMany({ where: { id: tokenId } });
}

function validTokenHash(token: string) {
  const candidate = token.trim();
  return TOKEN_PATTERN.test(candidate) ? hashAccountToken(candidate) : null;
}

export async function verifyEmailWithToken(token: string) {
  const tokenHash = validTokenHash(token);
  if (!tokenHash) {
    return false;
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const record = await tx.accountToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { emailVerifiedAt: true } } }
    });

    if (
      !record ||
      record.purpose !== AccountTokenPurpose.VERIFY_EMAIL ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      if (record) {
        await tx.accountToken.deleteMany({ where: { id: record.id } });
      }
      return false;
    }

    const claim = await tx.accountToken.deleteMany({
      where: { id: record.id, expiresAt: { gt: now } }
    });
    if (claim.count !== 1) {
      return false;
    }

    if (!record.user.emailVerifiedAt) {
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() }
      });
    }
    await tx.accountToken.deleteMany({
      where: {
        userId: record.userId,
        purpose: AccountTokenPurpose.VERIFY_EMAIL
      }
    });
    return true;
  });
}

export async function resetPasswordWithToken(input: {
  token: string;
  passwordHash: string;
}) {
  const tokenHash = validTokenHash(input.token);
  if (!tokenHash) {
    return false;
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const record = await tx.accountToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { emailVerifiedAt: true } } }
    });

    if (
      !record ||
      record.purpose !== AccountTokenPurpose.RESET_PASSWORD ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      if (record) {
        await tx.accountToken.deleteMany({ where: { id: record.id } });
      }
      return false;
    }

    const claim = await tx.accountToken.deleteMany({
      where: { id: record.id, expiresAt: { gt: now } }
    });
    if (claim.count !== 1) {
      return false;
    }

    await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash: input.passwordHash,
        emailVerifiedAt: record.user.emailVerifiedAt ?? now,
        authVersion: { increment: 1 }
      }
    });
    await tx.accountToken.deleteMany({ where: { userId: record.userId } });
    return true;
  });
}

export const __testables = {
  TOKEN_PATTERN,
  VERIFY_EMAIL_TTL_MS,
  RESET_PASSWORD_TTL_MS
};
