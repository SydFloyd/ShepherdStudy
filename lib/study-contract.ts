export type StudyRecommendation = {
  reference: string;
  reason: string;
  application: string;
  confidence: number;
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
  verses: PassageVerse[];
  chapterPath: string | null;
  excerpted?: boolean;
};

export type StudyResponsePayload = {
  mode: StudyMode;
  modeName: string;
  assistantBehaviorName: string;
  answer: string;
  context: string;
  relevance: string;
  passage: StudyPassageResult | null;
  recommendations: StudyRecommendation[];
  graph?: {
    sessionId: string;
    nodeId: string;
    recommendationNodeIds: Array<{
      reference: string;
      nodeId: string;
    }>;
  };
  saved: boolean;
};
