import { StudyResponsePayload } from "@/lib/study-contract";

export type StudyTurn = {
  id: string;
  kind: "prompt" | "verse";
  userText: string;
  graphNodeId: string;
  response: StudyResponsePayload;
};

export type PassagePreviewPayload = {
  reference: string;
  chapterReference: string;
  translation: string;
  translationName: string;
  verses: NonNullable<StudyResponsePayload["passage"]>["verses"];
  chapterPath: string | null;
  excerpted: boolean;
};

export type PendingVerseTurn = {
  id: string;
  userText: string;
  passage: NonNullable<StudyResponsePayload["passage"]> | null;
};

export type StudyGraphNode = {
  id: string;
  kind: "PROMPT" | "VERSE";
  label: string;
  isUserInput: boolean;
};

export type StudyGraphEdge = {
  fromNodeId: string;
  toNodeId: string;
};

