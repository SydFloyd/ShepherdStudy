import { createFakePrisma } from "../helpers/fake-prisma";

describe("wwjd history persistence", () => {
  it("persists and retrieves wwjd message threads", async () => {
    vi.resetModules();
    const fakePrisma = createFakePrisma();
    vi.doMock("@/lib/prisma", () => ({ prisma: fakePrisma }));
    const history = await import("@/lib/wwjd-history");

    const thread = await history.persistWwjdTurn({
      userId: "user-1",
      userMessage: "How should I forgive?",
      reply: "Forgive as you have been forgiven.",
      recommendations: [
        {
          reference: "Matthew 6:14",
          reason: "Forgiveness teaching",
          application: "Pray and release offense",
          confidence: 0.85
        }
      ]
    });

    const listed = await history.listWwjdThreads("user-1");
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(thread.id);

    const detail = await history.getWwjdThreadDetail({
      userId: "user-1",
      threadId: thread.id
    });

    expect(detail).not.toBeNull();
    expect(detail?.messages).toHaveLength(2);
    expect(detail?.messages[0]).toEqual({
      role: "user",
      content: "How should I forgive?",
      recommendations: undefined
    });
    expect(detail?.messages[1].role).toBe("assistant");
    expect(detail?.messages[1].recommendations?.[0].reference).toBe("Matthew 6:14");
  });
});
