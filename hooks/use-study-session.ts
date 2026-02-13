import { useState } from "react";

import { BibleTranslationId } from "@/lib/bible";
import {
  PassagePreviewPayload,
  PendingVerseTurn,
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
  const [pendingVerseTurn, setPendingVerseTurn] = useState<PendingVerseTurn | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
        history: buildHistory(turns)
      })
    });

    const data = (await parseJsonSafe(response)) as
      | (StudyResponsePayload & { error?: undefined })
      | { error: string };

    if (!response.ok || "error" in data) {
      setError(data.error ?? "Unable to generate recommendations.");
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
    setIsLoading(false);
    return true;
  }

  async function submitPrompt(input: SubmitPromptInput) {
    const trimmedPrompt = input.promptInput.trim();
    const initialPassage = turns.length === 0 ? input.startingPassage.trim() : "";

    if (!trimmedPrompt && !initialPassage) {
      return false;
    }

    return submitTurn({
      kind: "prompt",
      userText: trimmedPrompt || `Explore ${initialPassage}`,
      passage: initialPassage || undefined,
      prompt: trimmedPrompt || undefined,
      translation: input.translation
    });
  }

  async function selectRecommendation(input: {
    reference: string;
    translation: BibleTranslationId;
  }) {
    const pendingId = `pending-${Date.now()}`;
    const userText = `Selected verse: ${input.reference}`;
    setPendingVerseTurn({
      id: pendingId,
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
        history: buildHistory(turns)
      })
    });

    const previewResponse = await previewPromise;
    const previewData = (await parseJsonSafe(previewResponse)) as
      | (PassagePreviewPayload & { error?: undefined })
      | { error: string };

    if (previewResponse.ok && !("error" in previewData)) {
      setPendingVerseTurn((current) =>
        current && current.id === pendingId
          ? {
              ...current,
              passage: {
                origin: "input",
                reference: previewData.reference,
                chapterReference: previewData.chapterReference,
                translation: previewData.translation,
                translationName: previewData.translationName,
                verses: previewData.verses,
                chapterPath: previewData.chapterPath,
                excerpted: previewData.excerpted
              }
            }
          : current
      );
    }

    const studyResponse = await studyPromise;
    const studyData = (await parseJsonSafe(studyResponse)) as
      | (StudyResponsePayload & { error?: undefined })
      | { error: string };

    if (!studyResponse.ok || "error" in studyData) {
      setError(studyData.error ?? "Unable to generate recommendations.");
      setPendingVerseTurn((current) =>
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
        kind: "verse",
        userText,
        graphNodeId: studyData.graph?.nodeId ?? `local-${turnId}`,
        response: studyData
      }
    ]);
    setPendingVerseTurn((current) =>
      current && current.id === pendingId ? null : current
    );
    setIsLoading(false);
    return true;
  }

  return {
    turns,
    pendingVerseTurn,
    error,
    isLoading,
    setError,
    submitPrompt,
    selectRecommendation
  };
}

