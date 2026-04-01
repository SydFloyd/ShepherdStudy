type Props = {
  answer: string;
};

export function StudyAssistantPanel({ answer }: Props) {
  return (
    <article className="card assistantPanel">
      <h2>Assistant</h2>
      <p className="studyAssistantText">{answer}</p>
    </article>
  );
}
