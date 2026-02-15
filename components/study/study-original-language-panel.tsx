import { OriginalLanguageInsight } from "@/lib/study-contract";

type Props = {
  insight: OriginalLanguageInsight;
};

export function StudyOriginalLanguagePanel({ insight }: Props) {
  return (
    <article className="card studyOriginalLensCard">
      <h3>{insight.panelName}</h3>
      <p className="muted">
        Source: {insight.sourceTranslationName} ({insight.sourceTranslation})
      </p>
      <p>{insight.summary}</p>

      <details className="assistantDetail">
        <summary>Nuance Highlights</summary>
        <ul className="studyLensList">
          {insight.nuances.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>

      <details className="assistantDetail">
        <summary>Translation Notes</summary>
        <ul className="studyLensList">
          {insight.translationNotes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>

      {insight.wordHighlights.length > 0 ? (
        <details className="assistantDetail">
          <summary>Word-Level Highlights</summary>
          <div className="list">
            {insight.wordHighlights.map((item) => (
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
    </article>
  );
}
