import { useCallback, useEffect, useState } from "react";

import { BibleTranslationId } from "@/lib/bible";
import {
  PassagePreviewPayload,
  PendingStudyTurn,
  StudyThreadDetail,
  StudyThreadSummary,
  StudyTurn
} from "@/lib/study-client-contract";
import { buildHistory, parseJsonSafe } from "@/lib/study-client-utils";
import { StudyResponsePayload } from "@/lib/study-contract";

type SubmitPromptInput = {
  translation: BibleTranslationId;
  promptInput: string;
  startingPassage: string;
};

export function useStudySession() {
  const [turns, setTurns] = useState<StudyTurn[]>([]);
  const [threads, setThreads] = useState<StudyThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pendingTurn, setPendingTurn] = useState<PendingStudyTurn | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [insightLoadingByTurnId, setInsightLoadingByTurnId] = useState<
    Record<string, boolean>
  >({});
  const [insightUnavailableByTurnId, setInsightUnavailableByTurnId] = useState<
    Record<string, boolean>
  >({});

  function upsertThread(summary: StudyThreadSummary) {
    setThreads((current) => {
      const next = [summary, ...current.filter((item) => item.id !== summary.id)];
      next.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      return next;
    });
  }

  const loadThreads = useCallback(async () => {
    setIsHistoryLoading(true);
    const response = await fetch("/api/study/threads");
    const data = (await parseJsonSafe(response)) as
      | { threads: StudyThreadSummary[] }
      | { error: string };

    if (!response.ok || "error" in data) {
      setThreads([]);
      setIsHistoryLoading(false);
      return;
    }

    setThreads(data.threads);
    setIsHistoryLoading(false);
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  async function loadThread(threadId: string) {
    setIsHistoryLoading(true);
    const response = await fetch(`/api/study/threads/${threadId}`);
    const data = (await parseJsonSafe(response)) as
      | StudyThreadDetail
      | { error: string };

    if (!response.ok || "error" in data) {
      const message =
        "error" in data ? data.error : "Unable to load study thread.";
      setError(message);
      setIsHistoryLoading(false);
      return false;
    }

    setTurns(data.turns);
    setActiveThreadId(data.thread.id);
    upsertThread(data.thread);
    setError(null);
    setIsHistoryLoading(false);
    return true;
  }

  async function archiveThread(threadId: string) {
    const response = await fetch(`/api/study/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true })
    });

    if (!response.ok) {
      const data = (await parseJsonSafe(response)) as { error?: string };
      setError(data.error ?? "Unable to archive study thread.");
      return false;
    }

    setThreads((current) => current.filter((item) => item.id !== threadId));

    if (activeThreadId === threadId) {
      setActiveThreadId(null);
      setTurns([]);
    }
    return true;
  }

  async function renameThread(threadId: string, title: string) {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      return false;
    }

    const response = await fetch(`/api/study/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: normalizedTitle })
    });

    const data = (await parseJsonSafe(response)) as
      | { thread: StudyThreadSummary }
      | { error?: string };

    if (!response.ok || !("thread" in data)) {
      setError(("error" in data && data.error) || "Unable to rename study thread.");
      return false;
    }

    upsertThread(data.thread);
    if (activeThreadId === data.thread.id) {
      setActiveThreadId(data.thread.id);
    }
    return true;
  }

  const startNewThread = useCallback(() => {
    setActiveThreadId(null);
    setTurns([]);
    setPendingTurn(null);
    setError(null);
    setInsightLoadingByTurnId({});
    setInsightUnavailableByTurnId({});
  }, []);

  async function requestOriginalLanguageInsight(input: {
    translation: BibleTranslationId;
    passage: NonNullable<StudyResponsePayload["passage"]>;
  }): Promise<NonNullable<StudyResponsePayload["originalLanguageInsight"]> | null> {
    const response = await fetch("/api/study/original-language-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedTranslation: input.translation,
        passage: input.passage
      })
    });

    const data = (await parseJsonSafe(response)) as
      | {
          insight: NonNullable<StudyResponsePayload["originalLanguageInsight"]> | null;
          reason?: string;
        }
      | { error: string; details?: Array<{ path: string; message: string }> };

    if (!response.ok || !("insight" in data)) {
      if (!response.ok && "details" in data && data.details) {
        console.warn("original-language-insight invalid payload", data.details);
      }
      return null;
    }
    if (!data.insight && data.reason) {
      console.warn("original-language-insight unavailable", data.reason);
    }

    return data.insight ?? null;
  }

  async function hydrateOriginalLanguageInsight(input: {
    turnId: string;
    translation: BibleTranslationId;
    response: StudyResponsePayload;
  }) {
    if (!input.response.passage) {
      return;
    }

    setInsightLoadingByTurnId((current) => ({
      ...current,
      [input.turnId]: true
    }));

    const insight = await requestOriginalLanguageInsight({
      translation: input.translation,
      passage: input.response.passage
    });

    if (insight) {
      setTurns((current) =>
        current.map((turn) =>
          turn.id === input.turnId
            ? {
                ...turn,
                response: {
                  ...turn.response,
                  originalLanguageInsight: insight
                }
              }
            : turn
        )
      );
      setInsightUnavailableByTurnId((current) => {
        const next = { ...current };
        delete next[input.turnId];
        return next;
      });
    } else {
      setInsightUnavailableByTurnId((current) => ({
        ...current,
        [input.turnId]: true
      }));
    }

    setInsightLoadingByTurnId((current) => {
      const next = { ...current };
      delete next[input.turnId];
      return next;
    });
  }

  async function submitTurn(input: {
    kind: "prompt" | "verse";
    userText: string;
    passage?: string;
    prompt?: string;
    translation: BibleTranslationId;
  }) {
    setIsLoading(true);
    setError(null);

    const response = await fetch("/api/study", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        translation: input.translation,
        passage: input.passage,
        prompt: input.prompt,
        history: buildHistory(turns),
        threadId: activeThreadId ?? undefined,
        kind: input.kind,
        userText: input.userText
      })
    });

    const data = (await parseJsonSafe(response)) as
      | (StudyResponsePayload & { error?: undefined })
      | { error: string };

    if (!response.ok || "error" in data) {
      const message = data.error ?? "Unable to generate recommendations.";
      setError(`Study request failed (${response.status}): ${message}`);
      setIsLoading(false);
      return false;
    }

    const turnId = `${Date.now()}-${turns.length}`;
    setTurns((current) => [
      ...current,
      {
        id: turnId,
        kind: input.kind,
        userText: input.userText,
        graphNodeId: data.graph?.nodeId ?? `local-${turnId}`,
        response: data
      }
    ]);
    setInsightUnavailableByTurnId((current) => {
      const next = { ...current };
      delete next[turnId];
      return next;
    });
    void hydrateOriginalLanguageInsight({
      turnId,
      translation: input.translation,
      response: data
    });
    if (data.thread) {
      upsertThread({
        id: data.thread.id,
        title: data.thread.title ?? "Untitled Study",
        translation: input.translation,
        archivedAt: data.thread.archivedAt,
        updatedAt: data.thread.updatedAt
      });
      setActiveThreadId(data.thread.id);
    }
    setIsLoading(false);
    return true;
  }

  async function submitPrompt(input: SubmitPromptInput) {
    const trimmedPrompt = input.promptInput.trim();
    const initialPassage = turns.length === 0 ? input.startingPassage.trim() : "";

    if (!trimmedPrompt && !initialPassage) {
      return false;
    }

    const isVerseOnlyStart = !trimmedPrompt && Boolean(initialPassage);
    const kind: "prompt" | "verse" = isVerseOnlyStart ? "verse" : "prompt";
    const userText = trimmedPrompt || initialPassage;

    if (!initialPassage) {
      return submitTurn({
        kind,
        userText,
        passage: undefined,
        prompt: trimmedPrompt || undefined,
        translation: input.translation
      });
    }

    const pendingId = `pending-${Date.now()}`;
    setPendingTurn({
      id: pendingId,
      kind,
      userText,
      passage: null
    });
    setError(null);
    setIsLoading(true);

    const previewPromise = fetch("/api/passage-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: initialPassage,
        translation: input.translation
      })
    });

    const studyPromise = fetch("/api/study", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        translation: input.translation,
        passage: initialPassage,
        prompt: trimmedPrompt || undefined,
        history: buildHistory(turns),
        threadId: activeThreadId ?? undefined,
        kind,
        userText
      })
    });

    const previewResponse = await previewPromise;
    const previewData = (await parseJsonSafe(previewResponse)) as
      | (PassagePreviewPayload & { error?: undefined })
      | { error: string };

    let prefetchedInsightPromise:
      | Promise<NonNullable<StudyResponsePayload["originalLanguageInsight"]> | null>
      | null = null;

    if (previewResponse.ok && !("error" in previewData)) {
      const previewPassage: NonNullable<StudyResponsePayload["passage"]> = {
        origin: "input",
        reference: previewData.reference,
        chapterReference: previewData.chapterReference,
        translation: previewData.translation,
        translationName: previewData.translationName,
        verses: previewData.verses,
        chapterPath: previewData.chapterPath,
        excerpted: previewData.excerpted
      };

      setPendingTurn((current) =>
        current && current.id === pendingId
          ? {
              ...current,
              passage: previewPassage
            }
          : current
      );

      prefetchedInsightPromise = requestOriginalLanguageInsight({
        translation: input.translation,
        passage: previewPassage
      });
    }

    const studyResponse = await studyPromise;
    const studyData = (await parseJsonSafe(studyResponse)) as
      | (StudyResponsePayload & { error?: undefined })
      | { error: string };

    if (!studyResponse.ok || "error" in studyData) {
      const message = studyData.error ?? "Unable to generate recommendations.";
      setError(`Study request failed (${studyResponse.status}): ${message}`);
      setPendingTurn((current) =>
        current && current.id === pendingId ? null : current
      );
      setIsLoading(false);
      return false;
    }

    const turnId = `${Date.now()}-${turns.length}`;
    setTurns((current) => [
      ...current,
      {
        id: turnId,
        kind,
        userText,
        graphNodeId: studyData.graph?.nodeId ?? `local-${turnId}`,
        response: studyData
      }
    ]);
    if (prefetchedInsightPromise && studyData.passage) {
      setInsightLoadingByTurnId((current) => ({
        ...current,
        [turnId]: true
      }));
      void prefetchedInsightPromise
        .then((insight) => {
          if (!insight) {
            setInsightUnavailableByTurnId((current) => ({
              ...current,
              [turnId]: true
            }));
            return;
          }
          setTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    response: {
                      ...turn.response,
                      originalLanguageInsight: insight
                    }
                  }
                : turn
            )
          );
          setInsightUnavailableByTurnId((current) => {
            const next = { ...current };
            delete next[turnId];
            return next;
          });
        })
        .finally(() => {
          setInsightLoadingByTurnId((current) => {
            const next = { ...current };
            delete next[turnId];
            return next;
          });
        });
    } else {
      void hydrateOriginalLanguageInsight({
        turnId,
        translation: input.translation,
        response: studyData
      });
    }
    if (studyData.thread) {
      upsertThread({
        id: studyData.thread.id,
        title: studyData.thread.title ?? "Untitled Study",
        translation: input.translation,
        archivedAt: studyData.thread.archivedAt,
        updatedAt: studyData.thread.updatedAt
      });
      setActiveThreadId(studyData.thread.id);
    }

    setPendingTurn((current) =>
      current && current.id === pendingId ? null : current
    );
    setIsLoading(false);
    return true;
  }

  async function selectRecommendation(input: {
    reference: string;
    translation: BibleTranslationId;
    prompt?: string;
  }) {
    const pendingId = `pending-${Date.now()}`;
    const trimmedPrompt = input.prompt?.trim() ?? "";
    const userText = trimmedPrompt
      ? `Selected verse: ${input.reference}\nQuestion: ${trimmedPrompt}`
      : `Selected verse: ${input.reference}`;
    const kind: "prompt" | "verse" = trimmedPrompt ? "prompt" : "verse";
    setPendingTurn({
      id: pendingId,
      kind,
      userText,
      passage: null
    });
    setError(null);
    setIsLoading(true);

    const previewPromise = fetch("/api/passage-preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: input.reference,
        translation: input.translation
      })
    });

    const studyPromise = fetch("/api/study", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        translation: input.translation,
        passage: input.reference,
        prompt: trimmedPrompt || undefined,
        history: buildHistory(turns),
        threadId: activeThreadId ?? undefined,
        kind,
        userText
      })
    });

    const previewResponse = await previewPromise;
    const previewData = (await parseJsonSafe(previewResponse)) as
      | (PassagePreviewPayload & { error?: undefined })
      | { error: string };

    let prefetchedInsightPromise:
      | Promise<NonNullable<StudyResponsePayload["originalLanguageInsight"]> | null>
      | null = null;

    if (previewResponse.ok && !("error" in previewData)) {
      const previewPassage: NonNullable<StudyResponsePayload["passage"]> = {
        origin: "input",
        reference: previewData.reference,
        chapterReference: previewData.chapterReference,
        translation: previewData.translation,
        translationName: previewData.translationName,
        verses: previewData.verses,
        chapterPath: previewData.chapterPath,
        excerpted: previewData.excerpted
      };

      setPendingTurn((current) =>
        current && current.id === pendingId
          ? {
              ...current,
              passage: previewPassage
            }
          : current
      );

      prefetchedInsightPromise = requestOriginalLanguageInsight({
        translation: input.translation,
        passage: previewPassage
      });
    }

    const studyResponse = await studyPromise;
    const studyData = (await parseJsonSafe(studyResponse)) as
      | (StudyResponsePayload & { error?: undefined })
      | { error: string };

    if (!studyResponse.ok || "error" in studyData) {
      const message = studyData.error ?? "Unable to generate recommendations.";
      setError(`Study request failed (${studyResponse.status}): ${message}`);
      setPendingTurn((current) =>
        current && current.id === pendingId ? null : current
      );
      setIsLoading(false);
      return false;
    }

    const turnId = `${Date.now()}-${turns.length}`;
    setTurns((current) => [
      ...current,
      {
        id: turnId,
        kind,
        userText,
        graphNodeId: studyData.graph?.nodeId ?? `local-${turnId}`,
        response: studyData
      }
    ]);
    setInsightUnavailableByTurnId((current) => {
      const next = { ...current };
      delete next[turnId];
      return next;
    });
    if (prefetchedInsightPromise && studyData.passage) {
      setInsightLoadingByTurnId((current) => ({
        ...current,
        [turnId]: true
      }));
      void prefetchedInsightPromise
        .then((insight) => {
          if (!insight) {
            setInsightUnavailableByTurnId((current) => ({
              ...current,
              [turnId]: true
            }));
            return;
          }
          setTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    response: {
                      ...turn.response,
                      originalLanguageInsight: insight
                    }
                  }
                : turn
            )
          );
          setInsightUnavailableByTurnId((current) => {
            const next = { ...current };
            delete next[turnId];
            return next;
          });
        })
        .finally(() => {
          setInsightLoadingByTurnId((current) => {
            const next = { ...current };
            delete next[turnId];
            return next;
          });
        });
    } else {
      void hydrateOriginalLanguageInsight({
        turnId,
        translation: input.translation,
        response: studyData
      });
    }
    if (studyData.thread) {
      upsertThread({
        id: studyData.thread.id,
        title: studyData.thread.title ?? "Untitled Study",
        translation: input.translation,
        archivedAt: studyData.thread.archivedAt,
        updatedAt: studyData.thread.updatedAt
      });
      setActiveThreadId(studyData.thread.id);
    }
    setPendingTurn((current) =>
      current && current.id === pendingId ? null : current
    );
    setIsLoading(false);
    return true;
  }

  return {
    turns,
    threads,
    activeThreadId,
    pendingTurn,
    error,
    isLoading,
    isHistoryLoading,
    insightLoadingByTurnId,
    insightUnavailableByTurnId,
    setError,
    loadThreads,
    loadThread,
    archiveThread,
    renameThread,
    startNewThread,
    submitPrompt,
    selectRecommendation
  };
}
