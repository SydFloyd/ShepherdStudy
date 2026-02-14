"use client";

import { useState } from "react";

import { parseJsonSafe } from "@/lib/study-client-utils";

type Props = {
  surface: "study" | "wwjd";
  itemId: string;
  threadId?: string | null;
};

type Vote = "helpful" | "not_helpful";

export function FeedbackControls({ surface, itemId, threadId }: Props) {
  const [submittedVote, setSubmittedVote] = useState<Vote | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(vote: Vote) {
    setError(null);
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        surface,
        itemId,
        threadId: threadId ?? undefined,
        vote
      })
    });

    const data = (await parseJsonSafe(response)) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to submit feedback.");
      return;
    }

    setSubmittedVote(vote);
  }

  return (
    <div className="feedbackRow">
      <span className="muted">Was this helpful?</span>
      <button
        type="button"
        className={`feedbackButton${submittedVote === "helpful" ? " active" : ""}`}
        onClick={() => {
          void submit("helpful");
        }}
      >
        Helpful
      </button>
      <button
        type="button"
        className={`feedbackButton${submittedVote === "not_helpful" ? " active" : ""}`}
        onClick={() => {
          void submit("not_helpful");
        }}
      >
        Not helpful
      </button>
      {error ? <span className="muted">{error}</span> : null}
    </div>
  );
}
