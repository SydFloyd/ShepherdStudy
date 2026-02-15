export type StudyRecommendation = {
  reference: string;
  summary: string;
  reason?: string;
  application?: string;
  confidence?: number;
};

export type OriginalLanguageWord = {
  position: number;
  text: string;
  lemma: string | null;
  strong: string | null;
  morph: string | null;
};

export type OriginalLanguageVerse = {
  verse: number;
  text: string;
  words: OriginalLanguageWord[];
};

export type OriginalLanguageInsight = {
  panelName: string;
  sourceTranslation: string;
  sourceTranslationName: string;
  translationDeltas: string[];
  wordHighlights: Array<{
    term: string;
    note: string;
    lemma: string | null;
    strong: string | null;
    morph: string | null;
  }>;
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
  originalLanguageInsight?: OriginalLanguageInsight | null;
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
  thread?: {
    id: string;
    title: string | null;
    archivedAt: string | null;
    updatedAt: string;
  };
};
