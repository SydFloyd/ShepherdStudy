import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  content: string;
  className?: string;
};

function MarkdownMessageComponent({ content, className }: Props) {
  const classes = className ? `markdownMessage ${className}` : "markdownMessage";

  return (
    <div className={classes}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export const MarkdownMessage = memo(MarkdownMessageComponent);
MarkdownMessage.displayName = "MarkdownMessage";
