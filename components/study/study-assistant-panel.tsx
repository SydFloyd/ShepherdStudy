import { MarkdownMessage } from "@/components/shared/markdown-message";

type Props = {
  answer: string;
};

export function StudyAssistantPanel({ answer }: Props) {
  return (
    <article className="card assistantPanel">
      <h2>Assistant</h2>
      <MarkdownMessage content={answer} />
    </article>
  );
}
