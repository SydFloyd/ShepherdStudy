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
  const [pendingTurn, setPendingTurn] = useState<PendingStudyTurn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

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
  }, []);

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
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/study", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          translation: input.translation,
          prompt: trimmedPrompt || undefined,
          history: buildHistory(turns),
          threadId: activeThreadId ?? undefined,
          kind,
          userText
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
          kind,
          userText,
          response: data
        }
      ]);

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
        response: studyData
      }
    ]);

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
        response: studyData
      }
    ]);

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
