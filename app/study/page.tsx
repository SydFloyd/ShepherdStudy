"use client";

import { useEffect, useRef, useState } from "react";

import {
  BibleTranslationId,
  BIBLE_TRANSLATIONS,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { StudyAssistantPanel } from "@/components/study/study-assistant-panel";
import { StudyGraphPanel } from "@/components/study/study-graph-panel";
import { StudyPassagePanel } from "@/components/study/study-passage-panel";
import { StudyRecommendations } from "@/components/study/study-recommendations";
import { StudyThreadPanel } from "@/components/study/study-thread-panel";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { useStudyNavigation } from "@/hooks/use-study-navigation";
import { useStudySession } from "@/hooks/use-study-session";
import { buildLocalGraph } from "@/lib/study-client-utils";

export default function StudyPage() {
  const [translation, setTranslation] = useState<BibleTranslationId>(
    DEFAULT_BIBLE_TRANSLATION
  );
  const [startingPassage, setStartingPassage] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [expandedRecommendationsTurnId, setExpandedRecommendationsTurnId] =
    useState<string | null>(null);
  const { status: sessionStatus } = useAuthStatus();

  const {
    turns,
    threads,
    activeThreadId,
    pendingTurn,
    error,
    isLoading,
    isHistoryLoading,
    loadThread,
    archiveThread,
    renameThread,
    startNewThread,
    submitPrompt,
    selectRecommendation
  } = useStudySession();
  const { focusedNodeId, onGraphNodeSelect } = useStudyNavigation(turns);
  const turnsEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    turnsEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, isLoading]);

  useEffect(() => {
    if (turns.length === 0) {
      setExpandedRecommendationsTurnId(null);
      return;
    }
    setExpandedRecommendationsTurnId(turns[turns.length - 1].id);
  }, [turns]);

  async function onPromptSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await submitPrompt({
      translation,
      promptInput,
      startingPassage
    });

    if (ok) {
      setPromptInput("");
    }
  }

  async function onRecommendationSelect(
    reference: string,
    selectionTranslation?: string
  ) {
    const selectedTranslation = (selectionTranslation ??
      translation) as BibleTranslationId;
    if (selectedTranslation !== translation) {
      setTranslation(selectedTranslation);
    }
    await selectRecommendation({
      reference,
      translation: selectedTranslation
    });
  }

  const graph = buildLocalGraph(turns);
  const versionSelectWidthCh =
    Math.max(...BIBLE_TRANSLATIONS.map((item) => item.label.length), 8) + 2;

  return (
    <section className={`studyWorkspace${sessionStatus === "authenticated" ? " withHistory" : ""}`}>
      {sessionStatus === "authenticated" ? (
        <aside className="studyHistoryRail">
          <StudyThreadPanel
            threads={threads}
            activeThreadId={activeThreadId}
            isLoading={isHistoryLoading}
            onNewThread={startNewThread}
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
              />
            </label>
          </article>
        ) : null}

        <div className="studyTurns">
          {turns.map((turn) => (
            <section
              key={turn.id}
              id={`study-turn-${turn.id}`}
              data-graph-node-id={turn.graphNodeId}
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
                  context={turn.response.context}
                  relevance={turn.response.relevance}
                />
              </section>

              <StudyRecommendations
                recommendations={turn.response.recommendations}
                translation={turn.response.passage?.translation ?? translation}
                sourceNodeId={turn.graphNodeId}
                isOpen={expandedRecommendationsTurnId === turn.id}
                onToggleOpen={(open) => {
                  setExpandedRecommendationsTurnId(open ? turn.id : null);
                }}
                onSelectRecommendation={onRecommendationSelect}
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
          <div ref={turnsEndRef} />
        </div>

        <form onSubmit={onPromptSubmit} className="card studyComposer">
          <div className="studyComposerRow">
            <input
              value={promptInput}
              onChange={(event) => setPromptInput(event.target.value)}
              placeholder="Ask a question"
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? "Thinking..." : "Send"}
            </button>
          </div>
          {error ? <p className="muted">{error}</p> : null}
        </form>
      </div>

      {turns.length > 0 ? (
        <aside className="studyRail">
          <StudyGraphPanel
            nodes={graph.nodes}
            edges={graph.edges}
            activeNodeId={focusedNodeId ?? turns.at(-1)?.graphNodeId}
            onNodeSelect={onGraphNodeSelect}
          />
        </aside>
      ) : null}
    </section>
  );
}
