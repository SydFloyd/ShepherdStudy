import { buildHistory, parseJsonSafe } from "@/lib/study-client-utils";
import { StudyTurn } from "@/lib/study-client-contract";

function makeTurn(
  input: Partial<StudyTurn> & Pick<StudyTurn, "id" | "kind" | "userText">
): StudyTurn {
  return {
    id: input.id,
    kind: input.kind,
    userText: input.userText,
    response: input.response ?? {
      mode: "prompt_only",
      modeName: "Topical Discovery",
      assistantBehaviorName: "Topical Scout",
      answer: "Answer text",
      context: "Context text",
      relevance: "Relevance text",
      passage: null,
      recommendations: [],
      saved: false
    }
  };
}

describe("study client utils", () => {
  it("builds chat history from turns", () => {
    const turns: StudyTurn[] = [makeTurn({ id: "1", kind: "prompt", userText: "Ask" })];
    const history = buildHistory(turns);
    expect(history).toEqual([
      { role: "user", content: "Study Step 1\nUser prompt: Ask" },
      {
        role: "assistant",
        content: "Study Step 1 assistant output\n\nAnswer: Answer text"
      }
    ]);
  });

  it("compresses older turns and keeps recent turns expanded", () => {
    const turns: StudyTurn[] = Array.from({ length: 10 }, (_, index) =>
      makeTurn({
        id: String(index + 1),
        kind: "prompt",
        userText: `Prompt ${index + 1}`,
        response: {
          mode: "prompt_only",
          modeName: "Topical Discovery",
          assistantBehaviorName: "Topical Scout",
          answer: `Answer ${index + 1}`,
          context: `Context ${index + 1}`,
          relevance: `Relevance ${index + 1}`,
          recommendations: [],
          saved: false,
          passage: {
            origin: "anchor",
            reference: `John 1:${index + 1}`,
            chapterReference: "John 1",
            translation: "web",
            translationName: "WEB",
            verses: [],
            chapterPath: null
          }
        }
      })
    );

    const history = buildHistory(turns);
    expect(history[0]?.content).toContain("Compressed prior study steps (2)");
    expect(history[1]?.content).toContain("Compressed prior assistant outputs (2)");
    expect(history).toHaveLength(18);
  });

  it("returns structured error for invalid json payload", async () => {
    const response = new Response("not-json");
    const parsed = await parseJsonSafe(response);
    expect(parsed).toEqual({ error: "not-json" });
  });
});
