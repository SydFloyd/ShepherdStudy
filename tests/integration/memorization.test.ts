import { randomUUID } from "node:crypto";

import bcrypt from "bcryptjs";
import { MemorizationAttemptMode } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("memorization persistence", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    if (userIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await prisma.$disconnect();
  });

  it("stores a contiguous passage as one progress item and cascades its history", async () => {
    const user = await prisma.user.create({
      data: {
        email: `memorize-${randomUUID()}@example.com`,
        passwordHash: await bcrypt.hash("password", 4)
      }
    });
    userIds.push(user.id);
    expect(user.preferredTranslation).toBe("web");

    const passage = await prisma.memorizationPassage.create({
      data: {
        userId: user.id,
        translation: "web",
        reference: "Romans 8:1-4",
        book: "Romans",
        bookOrder: 45,
        chapter: 8,
        verseStart: 1,
        verseEnd: 4,
        isWholeChapter: false,
        text: "There is therefore now no condemnation.",
        verses: [
          { verse: 1, text: "There is therefore now no condemnation." },
          { verse: 2, text: "For the law of the Spirit of life set me free." },
          { verse: 3, text: "For what the law could not do, God did." },
          { verse: 4, text: "That the ordinance might be fulfilled." }
        ]
      }
    });

    await prisma.memorizationAttempt.create({
      data: {
        passageId: passage.id,
        userId: user.id,
        mode: MemorizationAttemptMode.TEXT,
        score: 92,
        wordCount: 36
      }
    });
    await prisma.memorizationRecommendationCache.create({
      data: {
        userId: user.id,
        sourceFingerprint: "fingerprint",
        translation: "web",
        model: "test-model",
        payload: [{ reference: "Romans 12:1-2", reason: "Next passage" }]
      }
    });

    expect(
      await prisma.memorizationPassage.count({ where: { userId: user.id } })
    ).toBe(1);
    expect(
      await prisma.memorizationAttempt.count({ where: { userId: user.id } })
    ).toBe(1);

    await prisma.memorizationPassage.delete({ where: { id: passage.id } });
    expect(
      await prisma.memorizationAttempt.count({ where: { userId: user.id } })
    ).toBe(0);
  });
});
