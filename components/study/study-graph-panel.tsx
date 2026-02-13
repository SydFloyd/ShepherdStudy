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
    <article className="card studyGraphPanel">
      <div className="studyGraphHeader">
        <h2>Navigation</h2>
      </div>
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
                  className={`studyGraphNodeButton ${node.kind.toLowerCase()}${node.isUserInput ? " userInput" : ""}${isActive ? " active" : ""}`}
                >
                  <span className="studyGraphNodeIndex">{index + 1}</span>
                  <span className="studyGraphNodeLabel">
                    {truncate(node.label, 42)}
                  </span>
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
