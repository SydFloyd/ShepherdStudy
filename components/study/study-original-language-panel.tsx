import { OriginalLanguageInsight } from "@/lib/study-contract";

type Props = {
  insight: OriginalLanguageInsight;
};

export function StudyOriginalLanguagePanel({ insight }: Props) {
  const deltas =
    insight.translationDeltas ??
    // Backward compatibility for previously saved responses.
    ((insight as unknown as { translationNotes?: string[] }).translationNotes ?? []);
  const wordHighlights = insight.wordHighlights ?? [];

  const hasDeltas = deltas.length > 0;
  const hasWordHighlights = wordHighlights.length > 0;

  return (
    <article className="card studyOriginalLensCard">
      <h3>{insight.panelName}</h3>
      <p className="muted">
        Source: {insight.sourceTranslationName} ({insight.sourceTranslation})
      </p>

      {hasDeltas ? (
        <details className="assistantDetail">
            <summary>Translation Deltas</summary>
            <ul className="studyLensList">
            {deltas.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {hasWordHighlights ? (
        <details className="assistantDetail">
          <summary>Word-Level Highlights</summary>
          <div className="list">
            {wordHighlights.map((item) => (
              <div key={`${item.term}-${item.strong ?? "none"}`} className="card studyLensWord">
                <p>
                  <strong>{item.term}</strong>
                  {item.lemma ? <span className="muted"> | lemma: {item.lemma}</span> : null}
                  {item.strong ? <span className="muted"> | {item.strong}</span> : null}
                </p>
                <p className="muted">{item.note}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {!hasDeltas && !hasWordHighlights ? (
        <p className="muted">
          No substantial original-language deltas detected for this passage.
        </p>
      ) : null}
    </article>
  );
}
