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
  const { status: sessionStatus } = useAuthStatus();

  const {
    turns,
    threads,
    activeThreadId,
    pendingVerseTurn,
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

  async function onRecommendationSelect(reference: string) {
    await selectRecommendation({
      reference,
      translation
    });
  }

  const graph = buildLocalGraph(turns);

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
          <h1>Study Companion</h1>
          <div className="studyTopRow">
            <label className="versionField">
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
            <label className="passageField">
              Starting Verse (optional)
              <input
                placeholder="Example: Matthew 6:25-34"
                value={startingPassage}
                onChange={(event) => setStartingPassage(event.target.value)}
              />
            </label>
          </div>
        </article>

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
                  modeName={turn.response.modeName}
                  behaviorName={turn.response.assistantBehaviorName}
                  answer={turn.response.answer}
                  context={turn.response.context}
                  relevance={turn.response.relevance}
                  feedbackItemId={turn.id}
                  threadId={activeThreadId}
                />
              </section>

              <StudyRecommendations
                recommendations={turn.response.recommendations}
                translation={turn.response.passage?.translation ?? translation}
                sourceNodeId={turn.graphNodeId}
                onSelectRecommendation={onRecommendationSelect}
              />
            </section>
          ))}
          {pendingVerseTurn ? (
            <section className="studyTurnBlock">
              <article className="card studyUserBubble">
                <p className="muted">Verse Selection</p>
                <p>{pendingVerseTurn.userText}</p>
              </article>
              <section className="studyResultGrid">
                {pendingVerseTurn.passage ? (
                  <StudyPassagePanel passage={pendingVerseTurn.passage} />
                ) : (
                  <article className="card">
                    <h2>Loading verse...</h2>
                  </article>
                )}
                <article className="card assistantPanel">
                  <h2>Assistant</h2>
                  <p className="muted">Thinking...</p>
                </article>
              </section>
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
