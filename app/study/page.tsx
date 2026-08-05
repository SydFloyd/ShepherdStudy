"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { TranslationPicker } from "@/components/translation-picker";
import { ScriptureAttribution } from "@/components/scripture-attribution";
import { BibleTranslationId, DEFAULT_BIBLE_TRANSLATION } from "@/lib/bible";
import { StudyAssistantPanel } from "@/components/study/study-assistant-panel";
import { StudyPassagePanel } from "@/components/study/study-passage-panel";
import { StudyRecommendations } from "@/components/study/study-recommendations";
import { StudyThreadPanel } from "@/components/study/study-thread-panel";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { useStudySession } from "@/hooks/use-study-session";
import { PassagePreviewPayload } from "@/lib/study-client-contract";
import { getStudyPassages } from "@/lib/study-contract";
import { getStudySelectionTranslation } from "@/lib/study-translation";

export default function StudyPage() {
  const [translation, setTranslation] = useState<BibleTranslationId>(
    DEFAULT_BIBLE_TRANSLATION
  );
  const [entryInput, setEntryInput] = useState("");
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
    setEntryInput("");
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
    const controller = new AbortController();
    let active = true;

    async function loadPreview() {
      if (!previewSelection) {
        setPreviewData(null);
        setPreviewError(null);
        setPreviewLoading(false);
        setPreviewPrompt("");
        return;
      }

      setPreviewLoading(true);
      setPreviewError(null);
      setPreviewData(null);

      try {
        const response = await fetch("/api/passage-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            reference: previewSelection.reference,
            translation: previewSelection.translation
          })
        });

        const data = (await response.json()) as
          | (PassagePreviewPayload & { error?: undefined })
          | { error: string };

        if (!active) {
          return;
        }
        if (!response.ok || "error" in data) {
          setPreviewError(data.error ?? "Unable to load verse preview.");
          return;
        }

        setPreviewData(data);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) {
          return;
        }
        setPreviewData(null);
        setPreviewError("Unable to load verse preview.");
      } finally {
        if (active) {
          setPreviewLoading(false);
        }
      }
    }

    void loadPreview();
    return () => {
      active = false;
      controller.abort();
    };
  }, [previewSelection]);

  useEffect(() => {
    setPreviewSelection((current) => {
      if (!current) {
        return current;
      }

      const nextTranslation = getStudySelectionTranslation(
        current.reference,
        translation
      );
      if (nextTranslation === current.translation) {
        return current;
      }

      return {
        ...current,
        translation: nextTranslation
      };
    });
  }, [translation]);

  async function onPromptSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) {
      return;
    }
    const submittedEntry = entryInput;

    if (!submittedEntry.trim()) {
      return;
    }

    setEntryInput("");

    const ok = await submitPrompt({
      translation,
      entryInput: submittedEntry
    });

    if (!ok) {
      setEntryInput(submittedEntry);
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
              setEntryInput("");
              setPreviewSelection(null);
              setPreviewData(null);
              setPreviewError(null);
              setPreviewPrompt("");
              startNewThread();
              window.scrollTo({ top: 0, behavior: "auto" });
            }}
            onSelectThread={async (threadId) => {
              setEntryInput("");
              setPreviewSelection(null);
              setPreviewData(null);
              setPreviewError(null);
              setPreviewPrompt("");
              const loadedThread = await loadThread(threadId);
              if (loadedThread) {
                if (loadedThread.thread.translation) {
                  setTranslation(loadedThread.thread.translation);
                }
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
            <TranslationPicker
              id="study-translation"
              className="versionField studyVersionField"
              label="Version"
              value={translation}
              onChange={setTranslation}
              disabled={isLoading}
            />
          </div>
        </article>

        {hasStudyContent ? (
          <div className="studyTurns">
            {turns.map((turn) => {
              const passages = getStudyPassages(turn.response);
              return (
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
                    {passages.length > 0 ? (
                      <div className="studyPassageList">
                        {passages.map((passage) => (
                          <StudyPassagePanel
                            key={`${turn.id}-${passage.reference}`}
                            passage={passage}
                          />
                        ))}
                      </div>
                    ) : (
                      <article className="card">
                        <h2>No Anchor Passage</h2>
                        <p className="muted">
                          This response did not resolve to an anchor passage.
                        </p>
                      </article>
                    )}
                    <StudyAssistantPanel
                      answer={turn.response.answer}
                    />
                  </section>
                  <StudyRecommendations
                    recommendations={turn.response.recommendations}
                    translation={translation}
                    isOpen={expandedRecommendationsTurnId === turn.id}
                    onToggleOpen={(open) => {
                      setExpandedRecommendationsTurnId((current) => {
                        if (open) {
                          return turn.id;
                        }
                        return current === turn.id ? null : current;
                      });
                    }}
                    onPreviewRecommendation={onRecommendationPreview}
                  />
                </section>
              );
            })}
            {pendingTurn ? (
              <section className="studyTurnBlock">
                <article className="card studyUserBubble">
                  <p className="muted">
                    {pendingTurn.kind === "verse" ? "Verse Selection" : "Prompt"}
                  </p>
                  <p>{pendingTurn.userText}</p>
                </article>
                <section className="studyResultGrid">
                  {pendingTurn.passages.length > 0 ? (
                    <div className="studyPassageList">
                      {pendingTurn.passages.map((passage) => (
                        <StudyPassagePanel
                          key={`${pendingTurn.id}-${passage.reference}`}
                          passage={passage}
                        />
                      ))}
                    </div>
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
          aria-busy={isLoading}
        >
          <div className="studyComposerRow">
            <input
              value={entryInput}
              onChange={(event) => setEntryInput(event.target.value)}
              onKeyDown={onInputSubmitShortcut}
              className="studyComposerEntryInput"
              placeholder="Enter a verse, verses, or question"
              disabled={isLoading}
            />
            <button
              type="submit"
              className={`studySendButton${isLoading ? " isLoading" : ""}`}
              aria-label={isLoading ? "Sending..." : "Send study request"}
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="studySendDots" aria-hidden="true">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              ) : (
                "\u2191"
              )}
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
                <div
                  className="modalBody scriptureText"
                  dir={previewData.source?.direction ?? "ltr"}
                  lang={previewData.source?.languageIso}
                >
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
                <ScriptureAttribution source={previewData.source ?? null} />
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
