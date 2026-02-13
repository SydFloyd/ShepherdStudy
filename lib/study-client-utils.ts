import {
  StudyGraphEdge,
  StudyGraphNode,
  StudyTurn
} from "@/lib/study-client-contract";

export async function parseJsonSafe(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return { error: "Empty response payload." };
  }

  try {
    return JSON.parse(text);
  } catch {
    const compact = text.replace(/\s+/g, " ").trim();
    return {
      error:
        compact.length > 180
          ? `${compact.slice(0, 180)}...`
          : compact || "Invalid response payload."
    };
  }
}

export function buildHistory(turns: StudyTurn[]) {
  return turns.flatMap((turn) => [
    { role: "user" as const, content: turn.userText },
    {
      role: "assistant" as const,
      content: `${turn.response.answer}\n\n${turn.response.context}\n\n${turn.response.relevance}`
    }
  ]);
}

export function buildLocalGraph(turns: StudyTurn[]): {
  nodes: StudyGraphNode[];
  edges: StudyGraphEdge[];
} {
  const nodes: StudyGraphNode[] = [];
  const edges: StudyGraphEdge[] = [];
  let previousNodeId: string | null = null;

  for (const turn of turns) {
    if (turn.kind === "prompt") {
      nodes.push({
        id: turn.graphNodeId,
        kind: "PROMPT",
        label: turn.userText,
        isUserInput: true
      });

      if (previousNodeId) {
        edges.push({
          fromNodeId: previousNodeId,
          toNodeId: turn.graphNodeId
        });
      }
      previousNodeId = turn.graphNodeId;

      if (turn.response.passage?.origin === "input") {
        const anchorVerseNodeId = `${turn.id}-anchor-verse`;
        nodes.push({
          id: anchorVerseNodeId,
          kind: "VERSE",
          label: turn.response.passage.reference,
          isUserInput: true
        });
        edges.push({
          fromNodeId: turn.graphNodeId,
          toNodeId: anchorVerseNodeId
        });
      }
      continue;
    }

    nodes.push({
      id: turn.graphNodeId,
      kind: "VERSE",
      label:
        turn.response.passage?.reference ??
        turn.userText.replace(/^Selected verse:\s*/i, ""),
      isUserInput: true
    });

    if (previousNodeId) {
      edges.push({
        fromNodeId: previousNodeId,
        toNodeId: turn.graphNodeId
      });
    }
    previousNodeId = turn.graphNodeId;
  }

  return { nodes, edges };
}

