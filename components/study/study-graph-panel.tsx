"use client";

type StudyGraphNode = {
  id: string;
  kind: "PROMPT" | "VERSE";
  label: string;
  isUserInput: boolean;
};

type StudyGraphEdge = {
  fromNodeId: string;
  toNodeId: string;
};

type Props = {
  nodes: StudyGraphNode[];
  edges: StudyGraphEdge[];
  activeNodeId?: string;
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
  onNodeSelect: (nodeId: string) => void;
};

function truncate(text: string, max = 22): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 1)}...`;
}

export function StudyGraphPanel({
  nodes,
  edges,
  activeNodeId,
  isCollapsed,
  onToggleCollapsed,
  onNodeSelect
}: Props) {
  const indexed = nodes.map((node, index) => {
    const incoming = edges.find((edge) => edge.toNodeId === node.id);
    return {
      node,
      index,
      parentNodeId: incoming?.fromNodeId
    };
  });

  return (
    <article className={`card studyGraphPanel${isCollapsed ? " collapsed" : ""}`}>
      {!isCollapsed ? (
        <div className="studyGraphHeader">
          <h2>Navigation</h2>
          <button
            type="button"
            className="studyGraphCollapseButton"
            onClick={onToggleCollapsed}
            aria-label="Collapse navigation"
            title="Collapse navigation"
          >
            -
          </button>
        </div>
      ) : (
        <div className="studyGraphHeader collapsedHeader">
          <span aria-hidden />
          <button
            type="button"
            className="studyGraphCollapseButton"
            onClick={onToggleCollapsed}
            aria-label="Expand navigation"
            title="Expand navigation"
          >
            +
          </button>
        </div>
      )}

      {indexed.length === 0 ? (
        <p className="muted">No graph data yet. Start a study turn to create your first node.</p>
      ) : null}

      {indexed.length > 0 ? (
        <div className="studyGraphColumn" role="list" aria-label="Study flow nodes">
          {indexed.map(({ node, index, parentNodeId }) => {
            const isActive = activeNodeId === node.id;
            return (
              <div key={node.id} className="studyGraphItem" role="listitem">
                <button
                  type="button"
                  onClick={() => onNodeSelect(node.id)}
                  title={node.label}
                  className={`studyGraphNodeButton ${node.kind.toLowerCase()}${node.isUserInput ? " userInput" : ""}${isActive ? " active" : ""}${isCollapsed ? " compact" : ""}`}
                >
                  <span className="studyGraphNodeIndex">{index + 1}</span>
                  {!isCollapsed ? (
                    <span className="studyGraphNodeLabel">
                      {truncate(node.label, 42)}
                    </span>
                  ) : null}
                </button>
                {index < indexed.length - 1 ? (
                  <div
                    className={`studyGraphConnector${parentNodeId ? " linked" : ""}`}
                    aria-hidden
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
