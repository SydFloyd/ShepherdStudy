"use client";

import { useEffect, useRef, useState } from "react";

import {
  BIBLE_TRANSLATIONS,
  BibleTranslationId,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { StudyRecommendation } from "@/lib/study-contract";

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
    text: string;
  }>;
  chapterPath: string | null;
  excerpted: boolean;
};

export default function WwjdPage() {
  const [translation, setTranslation] = useState(DEFAULT_BIBLE_TRANSLATION);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewRef, setPreviewRef] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<PassagePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

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
    setPreviewRef(null);
    setPreviewData(null);
    setPreviewError(null);
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
        history: messages.map((message) => ({
          role: message.role,
          content: message.content
        }))
      })
    });

    const data = (await response.json()) as
      | { reply: string; recommendations: StudyRecommendation[]; error?: undefined }
      | { error: string };

    if (!response.ok || "error" in data) {
      setError(data.error ?? "Unable to generate WWJD response.");
      setIsLoading(false);
      return;
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
                  {previewData.verses.map((verse) => (
                    <p key={verse.verse} className="verseRow">
                      <span className="verseNumber">{verse.verse}</span>
                      <span>{verse.text}</span>
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
  );
}
