import type { BibleSourceInfo } from "@/lib/bible";

export type StudyRecommendation = {
  reference: string;
  preview?: string;
  summary?: string;
  translation?: string;
  translationName?: string;
  source?: BibleSourceInfo;
};

export type StudyMode = "passage_only" | "prompt_only" | "passage_and_prompt";

export type PassageFootnote = {
  kind: "footnote" | "crossref";
  caller: string | null;
  text: string;
};

export type PassageVerse = {
  verse: number;
  paragraph: number;
  text: string;
  notes: PassageFootnote[];
};

export type StudyPassageResult = {
  origin: "input" | "anchor";
  reference: string;
  chapterReference: string;
  translation: string;
  translationName: string;
  source?: BibleSourceInfo;
  verses: PassageVerse[];
  chapterPath: string | null;
  excerpted?: boolean;
};

export type StudyResponsePayload = {
  mode: StudyMode;
  modeName: string;
  assistantBehaviorName: string;
  answer: string;
  // Context/relevance are intentionally disabled in Study UI for now.
  // Keep these fields for backward compatibility and easy re-enable later.
  context: string;
  relevance: string;
  passages?: StudyPassageResult[];
  passage: StudyPassageResult | null;
  recommendations: StudyRecommendation[];
  providerNotice?: string;
  saved: boolean;
  thread?: {
    id: string;
    title: string | null;
    archivedAt: string | null;
    updatedAt: string;
  };
};

export function getStudyPassages(input: {
  passages?: StudyPassageResult[] | null;
  passage: StudyPassageResult | null;
}): StudyPassageResult[] {
  const fromArray = Array.isArray(input.passages)
    ? input.passages.filter((item): item is StudyPassageResult => Boolean(item))
    : [];

  if (fromArray.length > 0) {
    return fromArray;
  }

  return input.passage ? [input.passage] : [];
}
