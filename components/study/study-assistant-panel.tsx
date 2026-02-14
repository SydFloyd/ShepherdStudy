import { FeedbackControls } from "@/components/feedback-controls";

type Props = {
  modeName: string;
  behaviorName: string;
  answer: string;
  context: string;
  relevance: string;
  feedbackItemId: string;
  threadId?: string | null;
};

export function StudyAssistantPanel({
  modeName,
  behaviorName,
  answer,
  context,
  relevance,
  feedbackItemId,
  threadId
}: Props) {
  return (
    <article className="card assistantPanel">
      <h2>Assistant</h2>
      <p className="muted">
        {modeName} | {behaviorName}
      </p>
      <p>{answer}</p>
      <h3>Context</h3>
      <p>{context}</p>
      <h3>Relevance</h3>
      <p>{relevance}</p>
      <FeedbackControls surface="study" itemId={feedbackItemId} threadId={threadId} />
    </article>
  );
}
