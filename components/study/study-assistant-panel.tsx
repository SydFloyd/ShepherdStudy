type Props = {
  answer: string;
  context: string;
  relevance: string;
};

export function StudyAssistantPanel({
  answer,
  context,
  relevance
}: Props) {
  return (
    <article className="card assistantPanel">
      <h2>Assistant</h2>
      <p>{answer}</p>
      <details className="assistantDetail">
        <summary>Context</summary>
        <p>{context}</p>
      </details>
      <details className="assistantDetail">
        <summary>Relevance</summary>
        <p>{relevance}</p>
      </details>
    </article>
  );
}
