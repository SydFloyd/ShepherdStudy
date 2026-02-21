"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  BibleTranslationId,
  BIBLE_TRANSLATIONS,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { StudyAssistantPanel } from "@/components/study/study-assistant-panel";
import { StudyPassagePanel } from "@/components/study/study-passage-panel";
import { StudyRecommendations } from "@/components/study/study-recommendations";
import { StudyThreadPanel } from "@/components/study/study-thread-panel";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { useStudySession } from "@/hooks/use-study-session";
import { PassagePreviewPayload } from "@/lib/study-client-contract";

export default function StudyPage() {
  const [translation, setTranslation] = useState<BibleTranslationId>(
    DEFAULT_BIBLE_TRANSLATION
  );
  const [startingPassage, setStartingPassage] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [expandedRecommendationsTurnId, setExpandedRecommendationsTurnId] =
    useState<string | null>(null);
  const [previewSelection, setPreviewSelection] = useState<{
    reference: string;
    translation: BibleTranslationId;
  } | null>(null);
  const [previewData, setPreviewData] = useState<PassagePreviewPayload | null>(
    null
  );
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState("");
  const { status: sessionStatus } = useAuthStatus();
  const router = useRouter();

  const {
    turns,
    threads,
    activeThreadId,
    pendingTurn,
    error,
    isLoading,
    isHistoryLoading,
    loadThreads,
    loadThread,
    archiveThread,
    renameThread,
    startNewThread,
    submitPrompt,
    selectRecommendation
  } = useStudySession();
  const composerFormRef = useRef<HTMLFormElement | null>(null);

  function resetStudyView() {
    setStartingPassage("");
    setPromptInput("");
    setPreviewSelection(null);
    setPreviewData(null);
    setPreviewError(null);
    setPreviewPrompt("");
    startNewThread();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") !== "1") {
      return;
    }
    resetStudyView();
    router.replace("/study", { scroll: false });
  }, [router, startNewThread]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function onNewStudyEvent() {
      resetStudyView();
    }

    window.addEventListener("study:new", onNewStudyEvent);
    return () => {
      window.removeEventListener("study:new", onNewStudyEvent);
    };
  }, [startNewThread]);

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      void loadThreads();
    }
  }, [sessionStatus, loadThreads]);

  useEffect(() => {
    if (turns.length === 0) {
      setExpandedRecommendationsTurnId(null);
      return;
    }
    setExpandedRecommendationsTurnId(turns[turns.length - 1].id);
  }, [turns]);

  useEffect(() => {
    async function loadPreview() {
      if (!previewSelection) {
        setPreviewData(null);
        setPreviewError(null);
        setPreviewPrompt("");
        return;
      }

      setPreviewLoading(true);
      setPreviewError(null);

      const response = await fetch("/api/passage-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: previewSelection.reference,
          translation: previewSelection.translation
        })
      });

      const data = (await response.json()) as
        | (PassagePreviewPayload & { error?: undefined })
        | { error: string };

      if (!response.ok || "error" in data) {
        setPreviewData(null);
        setPreviewError(data.error ?? "Unable to load verse preview.");
        setPreviewLoading(false);
        return;
      }

      setPreviewData(data);
      setPreviewLoading(false);
    }

    void loadPreview();
  }, [previewSelection]);

  async function onPromptSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isFirstTurn = turns.length === 0;
    const ok = await submitPrompt({
      translation,
      promptInput,
      startingPassage
    });

    if (ok) {
      setPromptInput("");
      if (isFirstTurn) {
        setStartingPassage("");
      }
    }
  }

  async function onRecommendationSelect(
    reference: string,
    selectionTranslation?: string,
    promptOverride?: string
  ) {
    const selectedTranslation = (selectionTranslation ??
      translation) as BibleTranslationId;
    if (selectedTranslation !== translation) {
      setTranslation(selectedTranslation);
    }
    await selectRecommendation({
      reference,
      translation: selectedTranslation,
      prompt: promptOverride?.trim() || undefined
    });
  }

  function onRecommendationPreview(
    reference: string,
    selectionTranslation?: string
  ) {
    const selectedTranslation = (selectionTranslation ??
      translation) as BibleTranslationId;
    setPreviewSelection({
      reference,
      translation: selectedTranslation
    });
  }

  async function onContinueFromPreview() {
    if (!previewSelection || isLoading) {
      return;
    }
    const { reference, translation: selectedTranslation } = previewSelection;
    setPreviewSelection(null);
    const question = previewPrompt.trim();
    setPreviewPrompt("");
    await onRecommendationSelect(
      reference,
      selectedTranslation,
      question || undefined
    );
  }

  const hasStudyContent = turns.length > 0 || Boolean(pendingTurn);
  const versionSelectWidthCh =
    Math.max(...BIBLE_TRANSLATIONS.map((item) => item.label.length), 8) + 2;

  function onInputSubmitShortcut(
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      if (!event.currentTarget.form) {
        composerFormRef.current?.requestSubmit();
      }
    }
  }

  return (
    <section className={`studyWorkspace${sessionStatus === "authenticated" ? " withHistory" : ""}`}>
      {sessionStatus === "authenticated" ? (
        <aside className="studyHistoryRail">
          <StudyThreadPanel
            threads={threads}
            activeThreadId={activeThreadId}
            isLoading={isHistoryLoading}
            onNewThread={() => {
              setStartingPassage("");
              setPromptInput("");
              setPreviewSelection(null);
              setPreviewData(null);
              setPreviewError(null);
              setPreviewPrompt("");
              startNewThread();
              window.scrollTo({ top: 0, behavior: "auto" });
            }}
            onSelectThread={async (threadId) => {
              setStartingPassage("");
              setPreviewSelection(null);
              setPreviewData(null);
              setPreviewError(null);
              setPreviewPrompt("");
              const ok = await loadThread(threadId);
              if (ok) {
                window.scrollTo({ top: 0, behavior: "auto" });
              }
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

      <div className="grid studyChatLayout studyMain">
        <article className="card studyTopSettings">
          <div className="studyTopHeader">
            <h1>Study Companion</h1>
            <label className="versionField studyVersionField">
              Version
              <select
                value={translation}
                onChange={(event) =>
                  setTranslation(event.target.value as BibleTranslationId)
                }
                style={{
                  width: `calc(${versionSelectWidthCh}ch + 2.5rem)`,
                  maxWidth: "100%"
                }}
              >
                {BIBLE_TRANSLATIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </article>

        {turns.length === 0 ? (
          <article className="card">
            <label className="passageField">
              Starting Verse (optional)
              <input
                placeholder="Example: Matthew 6:25-34"
                value={startingPassage}
                onChange={(event) => setStartingPassage(event.target.value)}
                onKeyDown={onInputSubmitShortcut}
              />
            </label>
          </article>
        ) : null}

        {hasStudyContent ? (
          <div className="studyTurns">
            {turns.map((turn) => (
              <section
                key={turn.id}
                id={`study-turn-${turn.id}`}
                className="studyTurnBlock"
              >
                <article className="card studyUserBubble">
                  <p className="muted">{turn.kind === "verse" ? "Verse Selection" : "Prompt"}</p>
                  <p>{turn.userText}</p>
                </article>

                <section className="studyResultGrid">
                  {turn.response.passage ? (
                    <StudyPassagePanel passage={turn.response.passage} />
                  ) : (
                    <article className="card">
                      <h2>No Anchor Passage</h2>
                      <p className="muted">
                        This response did not resolve to a single anchor verse.
                      </p>
                    </article>
                  )}
                  <StudyAssistantPanel
                    answer={turn.response.answer}
                  />
                </section>
                <StudyRecommendations
                  recommendations={turn.response.recommendations}
                  translation={turn.response.passage?.translation ?? translation}
                  isOpen={expandedRecommendationsTurnId === turn.id}
                  onToggleOpen={(open) => {
                    setExpandedRecommendationsTurnId(open ? turn.id : null);
                  }}
                  onPreviewRecommendation={onRecommendationPreview}
                />
              </section>
            ))}
            {pendingTurn ? (
              <section className="studyTurnBlock">
                <article className="card studyUserBubble">
                  <p className="muted">
                    {pendingTurn.kind === "verse" ? "Verse Selection" : "Prompt"}
                  </p>
                  <p>{pendingTurn.userText}</p>
                </article>
                <section className="studyResultGrid">
                  {pendingTurn.passage ? (
                    <StudyPassagePanel passage={pendingTurn.passage} />
                  ) : (
                    <article className="card">
                      <div className="loadingRow">
                        <span className="loadingSpinner" aria-hidden="true" />
                        <h2>Loading verse...</h2>
                      </div>
                    </article>
                  )}
                  <article className="card assistantPanel">
                    <div className="loadingRow">
                      <h2>Assistant</h2>
                      <span className="loadingSpinner" aria-hidden="true" />
                    </div>
                    <div className="skeletonBlock" aria-hidden="true">
                      <div className="skeletonLine long" />
                      <div className="skeletonLine" />
                      <div className="skeletonLine medium" />
                      <div className="skeletonLine long" />
                    </div>
                  </article>
                </section>
                <article className="card">
                  <div className="loadingRow">
                    <h3>Recommended verses</h3>
                    <span className="loadingSpinner" aria-hidden="true" />
                  </div>
                  <div className="list" aria-hidden="true">
                    <div className="card skeletonRecoCard">
                      <div className="skeletonLine short" />
                      <div className="skeletonLine long" />
                      <div className="skeletonLine medium" />
                    </div>
                    <div className="card skeletonRecoCard">
                      <div className="skeletonLine short" />
                      <div className="skeletonLine long" />
                      <div className="skeletonLine medium" />
                    </div>
                    <div className="card skeletonRecoCard">
                      <div className="skeletonLine short" />
                      <div className="skeletonLine long" />
                      <div className="skeletonLine medium" />
                    </div>
                  </div>
                </article>
              </section>
            ) : null}
          </div>
        ) : null}

        <form
          ref={composerFormRef}
          onSubmit={onPromptSubmit}
          className={`card studyComposer${hasStudyContent ? "" : " initial"}`}
        >
          <div className="studyComposerRow">
            <input
              value={promptInput}
              onChange={(event) => setPromptInput(event.target.value)}
              onKeyDown={onInputSubmitShortcut}
              placeholder="Ask a question"
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? "Thinking..." : "Send"}
            </button>
          </div>
          {error ? <p className="muted">{error}</p> : null}
        </form>
      </div>

      {previewSelection ? (
        <div
          className="modalBackdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Passage preview"
          onClick={() => setPreviewSelection(null)}
        >
          <div className="modalCard" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <h2>{previewData?.reference ?? previewSelection.reference}</h2>
              <button
                type="button"
                className="linkButton"
                onClick={() => setPreviewSelection(null)}
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
                    .reduce<Array<{ paragraph: number; verses: PassagePreviewPayload["verses"] }>>(
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
                <div className="studyPreviewActions">
                  <input
                    aria-label="Ask a question (optional)"
                    value={previewPrompt}
                    onChange={(event) => setPreviewPrompt(event.target.value)}
                    placeholder="Ask a question (optional)"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault();
                        void onContinueFromPreview();
                      }
                    }}
                  />
                  <div className="studyPreviewActionRow">
                    {previewData.chapterPath ? (
                      <a href={previewData.chapterPath}>Open full passage</a>
                    ) : (
                      <span />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        void onContinueFromPreview();
                      }}
                      disabled={isLoading}
                    >
                      Continue study with this verse
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
