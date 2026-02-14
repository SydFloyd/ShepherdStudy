import { createFakePrisma } from "../helpers/fake-prisma";

describe("study history persistence", () => {
  it("persists and retrieves study turns by thread", async () => {
    vi.resetModules();
    const fakePrisma = createFakePrisma();
    vi.doMock("@/lib/prisma", () => ({ prisma: fakePrisma }));
    const history = await import("@/lib/study-history");

    const responsePayload = {
      mode: "prompt_only" as const,
      modeName: "Topical Discovery",
      assistantBehaviorName: "Topical Scout",
      answer: "Grace answer",
      context: "Grace context",
      relevance: "Grace relevance",
      recommendations: [
        {
          reference: "Ephesians 2:8-9",
          reason: "Grace theme",
          application: "Trust God",
          confidence: 0.9
        }
      ],
      passage: null,
      saved: true
    };

    const thread = await history.persistStudyTurn({
      userId: "user-1",
      kind: "prompt",
      userText: "What is grace?",
      translation: "web",
      response: responsePayload
    });

    const listed = await history.listStudyThreads("user-1");
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(thread.id);

    const detail = await history.getStudyThreadDetail({
      userId: "user-1",
      threadId: thread.id
    });

    expect(detail).not.toBeNull();
    expect(detail?.turns).toHaveLength(1);
    expect(detail?.turns[0].userText).toBe("What is grace?");
    expect(detail?.turns[0].response.answer).toBe("Grace answer");
  });
});
