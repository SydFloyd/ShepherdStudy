"use client";

import { useEffect, useRef, useState } from "react";

import { WwjdThreadPanel } from "@/components/wwjd/wwjd-thread-panel";
import { useAuthStatus } from "@/hooks/use-auth-status";
import {
  BIBLE_TRANSLATIONS,
  BibleTranslationId,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { parseJsonSafe } from "@/lib/study-client-utils";
import { StudyRecommendation } from "@/lib/study-contract";
import { WwjdThreadDetail, WwjdThreadSummary } from "@/lib/wwjd-contract";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  recommendations?: StudyRecommendation[];
};

type PassagePreview = {
  reference: string;
  chapterReference: string;
  translation: string;
  translationName: string;
  verses: Array<{
    verse: number;
    paragraph: number;
    text: string;
    notes: Array<{
      kind: "footnote" | "crossref";
      caller: string | null;
      text: string;
    }>;
  }>;
  chapterPath: string | null;
  excerpted: boolean;
};

export default function WwjdPage() {
  const { status: sessionStatus } = useAuthStatus();
  const [translation, setTranslation] = useState(DEFAULT_BIBLE_TRANSLATION);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threads, setThreads] = useState<WwjdThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [previewRef, setPreviewRef] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PassagePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      setThreads([]);
      setActiveThreadId(null);
      return;
    }

    async function loadThreads() {
      setIsHistoryLoading(true);
      const response = await fetch("/api/wwjd/threads");
      const data = (await parseJsonSafe(response)) as
        | { threads: WwjdThreadSummary[] }
        | { error: string };

      if (!response.ok || "error" in data) {
        setIsHistoryLoading(false);
        return;
      }

      setThreads(data.threads);
      setIsHistoryLoading(false);
    }

    void loadThreads();
  }, [sessionStatus]);

  useEffect(() => {
    async function loadPreview() {
      if (!previewRef) {
        setPreviewData(null);
        setPreviewError(null);
        return;
      }

      setPreviewLoading(true);
      setPreviewError(null);

      const response = await fetch("/api/passage-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: previewRef,
          translation
        })
      });

      const data = (await response.json()) as
        | (PassagePreview & { error?: undefined })
        | { error: string };

      if (!response.ok || "error" in data) {
        setPreviewError(data.error ?? "Unable to load verse preview.");
        setPreviewData(null);
        setPreviewLoading(false);
        return;
      }

      setPreviewData(data);
      setPreviewLoading(false);
    }

    loadPreview();
  }, [previewRef, translation]);

  function clearChat() {
    setMessages([]);
    setInput("");
    setError(null);
    setActiveThreadId(null);
    setPreviewRef(null);
    setPreviewData(null);
    setPreviewError(null);
  }

  function upsertThread(summary: WwjdThreadSummary) {
    setThreads((current) => {
      const next = [summary, ...current.filter((item) => item.id !== summary.id)];
      next.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      return next;
    });
  }

  async function loadThread(threadId: string) {
    setIsHistoryLoading(true);
    const response = await fetch(`/api/wwjd/threads/${threadId}`);
    const data = (await parseJsonSafe(response)) as
      | WwjdThreadDetail
      | { error: string };

    if (!response.ok || "error" in data) {
      const message = "error" in data ? data.error : "Unable to load WWJD thread.";
      setError(message);
      setIsHistoryLoading(false);
      return;
    }

    setMessages(data.messages);
    setActiveThreadId(data.thread.id);
    upsertThread(data.thread);
    setError(null);
    setIsHistoryLoading(false);
  }

  async function archiveThread(threadId: string) {
    const response = await fetch(`/api/wwjd/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true })
    });

    if (!response.ok) {
      const data = (await parseJsonSafe(response)) as { error?: string };
      setError(data.error ?? "Unable to archive WWJD thread.");
      return;
    }

    setThreads((current) => current.filter((item) => item.id !== threadId));
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
      setMessages([]);
    }
  }

  async function renameThread(threadId: string, title: string) {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return;
    }

    const response = await fetch(`/api/wwjd/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: normalizedTitle })
    });

    const data = (await parseJsonSafe(response)) as
      | { thread: WwjdThreadSummary }
      | { error?: string };
    if (!response.ok || !("thread" in data)) {
      setError(("error" in data && data.error) || "Unable to rename WWJD chat.");
      return;
    }

    upsertThread(data.thread);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextInput = input.trim();
    if (!nextInput) {
      return;
    }

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: nextInput }
    ];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    const response = await fetch("/api/wwjd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: nextInput,
        threadId: activeThreadId ?? undefined,
        history: messages.map((message) => ({
          role: message.role,
          content: message.content
        }))
      })
    });

    const data = (await parseJsonSafe(response)) as
      | {
          reply: string;
          recommendations: StudyRecommendation[];
          thread?: WwjdThreadSummary;
          error?: undefined;
        }
      | { error: string };

    if (!response.ok || "error" in data) {
      const message = data.error ?? "Unable to generate WWJD response.";
      setError(`WWJD request failed (${response.status}): ${message}`);
      setIsLoading(false);
      return;
    }

    const nextThread = "thread" in data ? data.thread : undefined;
    if (nextThread) {
      upsertThread(nextThread);
      setActiveThreadId(nextThread.id);
    }

    setMessages([
      ...nextMessages,
      {
        role: "assistant",
        content: data.reply,
        recommendations: data.recommendations
      }
    ]);
    setIsLoading(false);
  }

  return (
    <section className={`wwjdWorkspace${sessionStatus === "authenticated" ? " withHistory" : ""}`}>
      {sessionStatus === "authenticated" ? (
        <aside className="wwjdHistoryRail">
          <WwjdThreadPanel
            threads={threads}
            activeThreadId={activeThreadId}
            isLoading={isHistoryLoading}
            onNewThread={clearChat}
            onSelectThread={(threadId) => {
              void loadThread(threadId);
            }}
            onArchiveThread={(threadId) => {
              void archiveThread(threadId);
            }}
            onRenameThread={(threadId, title) => {
              void renameThread(threadId, title);
            }}
          />
        </aside>
      ) : null}

      <section className="grid">
      <article className="card wwjdChat wwjdUnified">
        <div className="wwjdHeader">
          <h1>WWJD</h1>
          <div className="wwjdHeaderActions">
            <label className="inlineVersionSelect">
              Version
              <select
                value={translation}
                onChange={(event) =>
                  setTranslation(event.target.value as BibleTranslationId)
                }
              >
                {BIBLE_TRANSLATIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="clearChatButton"
              onClick={clearChat}
              disabled={messages.length === 0}
            >
              Clear chat
            </button>
          </div>
        </div>
        <p className="muted">
          This is an AI emulation of the voice of the Son of God. It may be
          mistaken and may not reflect what Jesus would truly say or do. Always
          test responses against Scripture, prayer, and wise pastoral counsel.
        </p>

        <div className="wwjdMessages">
          {messages.length === 0 ? (
            <p className="muted">No messages yet.</p>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === "assistant"
                    ? "wwjdMessage assistant"
                    : "wwjdMessage user"
                }
              >
                <p className="wwjdRole">
                  {message.role === "assistant" ? "WWJD Assistant" : "You"}
                </p>
                <p>{message.content}</p>
                {message.role === "assistant" && message.recommendations ? (
                  <details className="wwjdRecoBar">
                    <summary>
                      {message.recommendations.length} recommended verses
                    </summary>
                    <div className="list">
                      {message.recommendations.map((item) => (
                        <button
                          type="button"
                          key={`${index}-${item.reference}`}
                          className="recoItemButton"
                          onClick={() => setPreviewRef(item.reference)}
                        >
                          {item.reference}
                        </button>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={onSubmit} className="wwjdInputRow">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask anything from a Christ-centered perspective."
          />
          <button type="submit" disabled={isLoading} className="wwjdSend">
            {isLoading ? "..." : "Send"}
          </button>
          {error ? <p className="muted">{error}</p> : null}
        </form>
      </article>

      {previewRef ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Passage preview"
          onClick={() => setPreviewRef(null)}
        >
          <div className="modalCard" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <h2>{previewData?.reference ?? previewRef}</h2>
              <button
                type="button"
                className="linkButton"
                onClick={() => setPreviewRef(null)}
              >
                Close
              </button>
            </div>
            {previewLoading ? <p className="muted">Loading passage...</p> : null}
            {previewError ? <p className="muted">{previewError}</p> : null}
            {previewData ? (
              <>
                <p className="muted">
                  {previewData.translationName}
                  {previewData.excerpted ? " | excerpted preview" : ""}
                </p>
                <div className="modalBody">
                  {previewData.verses
                    .reduce<Array<{ paragraph: number; verses: PassagePreview["verses"] }>>(
                      (groups, verse) => {
                        const current = groups[groups.length - 1];
                        if (!current || current.paragraph !== verse.paragraph) {
                          groups.push({ paragraph: verse.paragraph, verses: [verse] });
                        } else {
                          current.verses.push(verse);
                        }
                        return groups;
                      },
                      []
                    )
                    .map((group) => (
                      <p className="paragraphText" key={group.paragraph}>
                        {group.verses.map((verse) => (
                          <span key={verse.verse} className="verseInline">
                            <span className="verseNumber">{verse.verse}</span>
                            <span>{verse.text}</span>
                            {verse.notes.length > 0 ? (
                              <sup className="noteCounter">{verse.notes.length}</sup>
                            ) : null}
                          </span>
                        ))}
                      </p>
                    ))}
                </div>
                {previewData.chapterPath ? (
                  <p>
                    <a href={previewData.chapterPath}>Open full passage</a>
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      </section>
    </section>
  );
}
