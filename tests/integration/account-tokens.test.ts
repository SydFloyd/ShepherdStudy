import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { AccountTokenPurpose } from "@prisma/client";

import {
  createAccountToken,
  hashAccountToken,
  resetPasswordWithToken,
  verifyEmailWithToken
} from "@/lib/account-tokens";
import { prisma } from "@/lib/prisma";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("account verification and recovery tokens", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  it("stores verification tokens as hashes and consumes them once", async () => {
    const user = await prisma.user.create({
      data: {
        email: `verify-${randomUUID()}@example.com`,
        passwordHash: await bcrypt.hash("old-password", 4)
      }
    });
    userIds.push(user.id);

    const issued = await createAccountToken(
      user.id,
      AccountTokenPurpose.VERIFY_EMAIL
    );
    const stored = await prisma.accountToken.findUnique({
      where: { tokenHash: hashAccountToken(issued.token) }
    });
    expect(stored?.tokenHash).not.toBe(issued.token);

    await expect(verifyEmailWithToken(issued.token)).resolves.toBe(true);
    await expect(verifyEmailWithToken(issued.token)).resolves.toBe(false);
    await expect(
      prisma.user.findUnique({
        where: { id: user.id },
        select: { emailVerifiedAt: true }
      })
    ).resolves.toMatchObject({ emailVerifiedAt: expect.any(Date) });
  });

  it("resets the password, verifies the account, and revokes sessions", async () => {
    const user = await prisma.user.create({
      data: {
        email: `reset-${randomUUID()}@example.com`,
        passwordHash: await bcrypt.hash("old-password", 4)
      }
    });
    userIds.push(user.id);
    const issued = await createAccountToken(
      user.id,
      AccountTokenPurpose.RESET_PASSWORD
    );
    const passwordHash = await bcrypt.hash("new-password", 4);
    const competingPasswordHash = await bcrypt.hash("competing-password", 4);

    const concurrent = await Promise.all([
      resetPasswordWithToken({ token: issued.token, passwordHash }),
      resetPasswordWithToken({
        token: issued.token,
        passwordHash: competingPasswordHash
      })
    ]);
    expect(concurrent.filter(Boolean)).toHaveLength(1);
    await expect(
      resetPasswordWithToken({ token: issued.token, passwordHash })
    ).resolves.toBe(false);

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id }
    });
    expect(updated.authVersion).toBe(1);
    expect(updated.emailVerifiedAt).toBeInstanceOf(Date);
    const matchesEither =
      (await bcrypt.compare("new-password", updated.passwordHash)) ||
      (await bcrypt.compare("competing-password", updated.passwordHash));
    expect(matchesEither).toBe(true);
  });
});
