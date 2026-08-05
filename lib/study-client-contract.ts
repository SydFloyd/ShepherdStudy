import { StudyResponsePayload } from "@/lib/study-contract";

export type StudyTurn = {
  id: string;
  kind: "prompt" | "verse";
  userText: string;
  response: StudyResponsePayload;
};

export type PassagePreviewPayload = {
  reference: string;
  chapterReference: string;
  translation: string;
  translationName: string;
  source?: NonNullable<StudyResponsePayload["passage"]>["source"];
  verses: NonNullable<StudyResponsePayload["passage"]>["verses"];
  chapterPath: string | null;
  excerpted: boolean;
};

export type PendingStudyTurn = {
  id: string;
  kind: "prompt" | "verse";
  userText: string;
  passages: Array<NonNullable<StudyResponsePayload["passage"]>>;
};

export type StudyThreadSummary = {
  id: string;
  title: string;
  translation: string | null;
  archivedAt: string | null;
  updatedAt: string;
};

export type StudyThreadDetail = {
  thread: StudyThreadSummary;
  turns: StudyTurn[];
};
