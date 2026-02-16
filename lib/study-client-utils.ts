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
  const configuredRecentTurns = Number(
    process.env.NEXT_PUBLIC_STUDY_HISTORY_RECENT_TURNS ?? 8
  );
  const RECENT_FULL_TURNS = Number.isFinite(configuredRecentTurns)
    ? Math.min(24, Math.max(2, Math.floor(configuredRecentTurns)))
    : 8;

  function truncate(input: string, max = 3800) {
    if (input.length <= max) {
      return input;
    }
    return `${input.slice(0, max - 1)}...`;
  }

  function extractPromptText(turn: StudyTurn) {
    if (turn.kind !== "prompt") {
      return "";
    }
    const match = turn.userText.match(/Question:\s*([\s\S]+)/i);
    if (match?.[1]) {
      return match[1].trim();
    }
    return turn.userText.trim();
  }

  function buildFullTurnMessages(turn: StudyTurn, index: number) {
    const promptText = extractPromptText(turn);
    const anchorReference = turn.response.passage?.reference ?? "";
    const userContent = truncate(
      [
        `Study Step ${index + 1}`,
        promptText ? `User prompt: ${promptText}` : null,
        anchorReference ? `Selected/anchor verse: ${anchorReference}` : null
      ]
        .filter(Boolean)
        .join("\n")
    );

    const assistantContent = truncate(
      [
        `Study Step ${index + 1} assistant output`,
        `Answer: ${turn.response.answer}`,
        `Context: ${turn.response.context}`,
        `Relevance: ${turn.response.relevance}`
      ].join("\n\n")
    );

    return [
      { role: "user" as const, content: userContent },
      { role: "assistant" as const, content: assistantContent }
    ];
  }

  function buildCompressedHistoryMessages(olderTurns: StudyTurn[]) {
    if (olderTurns.length === 0) {
      return [] as Array<{ role: "user" | "assistant"; content: string }>;
    }

    const userLines = olderTurns.map((turn, index) => {
      const promptText = extractPromptText(turn);
      const anchorReference = turn.response.passage?.reference ?? "";
      return `Step ${index + 1}: prompt=${promptText || "(none)"} | verse=${anchorReference || "(none)"}`;
    });

    const assistantLines = olderTurns.map((turn, index) => {
      return `Step ${index + 1}: answer=${turn.response.answer} | context=${turn.response.context} | relevance=${turn.response.relevance}`;
    });

    return [
      {
        role: "user" as const,
        content: truncate(
          `Compressed prior study steps (${olderTurns.length}):\n${userLines.join("\n")}`
        )
      },
      {
        role: "assistant" as const,
        content: truncate(
          `Compressed prior assistant outputs (${olderTurns.length}):\n${assistantLines.join("\n")}`
        )
      }
    ];
  }

  if (turns.length <= RECENT_FULL_TURNS) {
    return turns.flatMap((turn, index) => buildFullTurnMessages(turn, index));
  }

  const olderTurns = turns.slice(0, turns.length - RECENT_FULL_TURNS);
  const recentTurns = turns.slice(turns.length - RECENT_FULL_TURNS);
  const compressed = buildCompressedHistoryMessages(olderTurns);
  const recentMessages = recentTurns.flatMap((turn, idx) =>
    buildFullTurnMessages(turn, olderTurns.length + idx)
  );

  return [...compressed, ...recentMessages];
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
