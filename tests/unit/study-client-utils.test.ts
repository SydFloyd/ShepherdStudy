import { buildHistory, buildLocalGraph, parseJsonSafe } from "@/lib/study-client-utils";
import { StudyTurn } from "@/lib/study-client-contract";

function makeTurn(input: Partial<StudyTurn> & Pick<StudyTurn, "id" | "kind" | "userText" | "graphNodeId">): StudyTurn {
  return {
    id: input.id,
    kind: input.kind,
    userText: input.userText,
    graphNodeId: input.graphNodeId,
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
    const turns: StudyTurn[] = [
      makeTurn({ id: "1", kind: "prompt", userText: "Ask", graphNodeId: "n1" })
    ];
    const history = buildHistory(turns);
    expect(history).toEqual([
      { role: "user", content: "Ask" },
      {
        role: "assistant",
        content: "Answer text\n\nContext text\n\nRelevance text"
      }
    ]);
  });

  it("builds graph nodes for prompt and verse turns", () => {
    const turns: StudyTurn[] = [
      makeTurn({
        id: "1",
        kind: "prompt",
        userText: "Why?",
        graphNodeId: "p1",
        response: {
          mode: "passage_and_prompt",
          modeName: "Passage-Anchored Inquiry",
          assistantBehaviorName: "Triangulated Guidance",
          answer: "A",
          context: "C",
          relevance: "R",
          recommendations: [],
          saved: false,
          passage: {
            origin: "input",
            reference: "John 3:16",
            chapterReference: "John 3",
            translation: "web",
            translationName: "WEB",
            verses: [],
            chapterPath: null
          }
        }
      }),
      makeTurn({
        id: "2",
        kind: "verse",
        userText: "Selected verse: Romans 8:28",
        graphNodeId: "v1"
      })
    ];
    const graph = buildLocalGraph(turns);
    expect(graph.nodes.map((node) => node.id)).toEqual(["p1", "1-anchor-verse", "v1"]);
    expect(graph.edges).toEqual([
      { fromNodeId: "p1", toNodeId: "1-anchor-verse" },
      { fromNodeId: "p1", toNodeId: "v1" }
    ]);
  });

  it("returns structured error for invalid json payload", async () => {
    const response = new Response("not-json");
    const parsed = await parseJsonSafe(response);
    expect(parsed).toEqual({ error: "not-json" });
  });
});
