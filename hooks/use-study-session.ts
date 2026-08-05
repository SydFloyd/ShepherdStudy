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
import {
  extractScriptureReferencesFromText,
  hasMeaningfulPromptText
} from "@/lib/scripture";
import { StudyResponsePayload } from "@/lib/study-contract";

type SubmitPromptInput = {
  translation: BibleTranslationId;
  entryInput: string;
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
      return null;
    }

    setTurns(data.turns);
    setActiveThreadId(data.thread.id);
    upsertThread(data.thread);
    setError(null);
    setIsHistoryLoading(false);
    return data;
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

  function buildPreviewPassage(
    preview: PassagePreviewPayload
  ): NonNullable<StudyResponsePayload["passage"]> {
    return {
      origin: "input",
      reference: preview.reference,
      chapterReference: preview.chapterReference,
      translation: preview.translation,
      translationName: preview.translationName,
      source: preview.source,
      verses: preview.verses,
      chapterPath: preview.chapterPath,
      excerpted: preview.excerpted
    };
  }

  async function loadPendingPassages(input: {
    pendingId: string;
    references: string[];
    translation: BibleTranslationId;
  }) {
    const previews = await Promise.all(
      input.references.map(async (reference) => {
        const response = await fetch("/api/passage-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reference,
            translation: input.translation
          })
        });
        const data = (await parseJsonSafe(response)) as
          | (PassagePreviewPayload & { error?: undefined })
          | { error: string };

        if (!response.ok || "error" in data) {
          return null;
        }

        return buildPreviewPassage(data);
      })
    );

    const passages = previews.filter(
      (item): item is NonNullable<StudyResponsePayload["passage"]> => Boolean(item)
    );
    if (passages.length === 0) {
      return;
    }

    setPendingTurn((current) =>
      current && current.id === input.pendingId
        ? {
            ...current,
            passages
          }
        : current
    );
  }

  async function executeStudyRequest(input: {
    translation: BibleTranslationId;
    passages: string[];
    prompt?: string;
    kind: "prompt" | "verse";
    userText: string;
  }) {
    const pendingId = `pending-${Date.now()}`;
    if (input.passages.length > 0) {
      setPendingTurn({
        id: pendingId,
        kind: input.kind,
        userText: input.userText,
        passages: []
      });
      void loadPendingPassages({
        pendingId,
        references: input.passages,
        translation: input.translation
      }).catch(() => undefined);
    }

    setError(null);
    setIsLoading(true);

    const studyResponse = await fetch("/api/study", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-source-route": "/study"
      },
      body: JSON.stringify({
        translation: input.translation,
        passage: input.passages[0],
        passages: input.passages,
        prompt: input.prompt,
        history: buildHistory(turns),
        threadId: activeThreadId ?? undefined,
        kind: input.kind,
        userText: input.userText
      })
    });

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
        kind: input.kind,
        userText: input.userText,
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

  async function submitPrompt(input: SubmitPromptInput) {
    const entryText = input.entryInput.trim();
    if (!entryText) {
      return false;
    }

    const extraction = extractScriptureReferencesFromText(entryText);
    const selectedPassages = extraction.references;
    const hasPromptText = hasMeaningfulPromptText(extraction.residualText);
    if (selectedPassages.length === 0 && !hasPromptText) {
      return false;
    }

    const kind: "prompt" | "verse" =
      selectedPassages.length > 0 && !hasPromptText ? "verse" : "prompt";
    const selectedText = selectedPassages.join("; ");
    const verseLabel = `Selected verse${selectedPassages.length > 1 ? "s" : ""}: ${selectedText}`;
    const userText =
      kind === "verse"
        ? verseLabel
        : selectedPassages.length > 0
          ? `${verseLabel}\nQuestion: ${entryText}`
          : entryText;

    return executeStudyRequest({
      translation: input.translation,
      passages: selectedPassages,
      prompt: hasPromptText ? entryText : undefined,
      kind,
      userText
    });
  }

  async function selectRecommendation(input: {
    reference: string;
    translation: BibleTranslationId;
    prompt?: string;
  }) {
    const trimmedPrompt = input.prompt?.trim() ?? "";
    const userText = trimmedPrompt
      ? `Selected verse: ${input.reference}\nQuestion: ${trimmedPrompt}`
      : `Selected verse: ${input.reference}`;
    const kind: "prompt" | "verse" = trimmedPrompt ? "prompt" : "verse";

    return executeStudyRequest({
      translation: input.translation,
      passages: [input.reference],
      prompt: trimmedPrompt || undefined,
      kind,
      userText
    });
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
