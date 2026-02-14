import { StudyRecommendation } from "@/lib/study-contract";

export type WwjdChatMessage = {
  role: "user" | "assistant";
  content: string;
  recommendations?: StudyRecommendation[];
};

export type WwjdThreadSummary = {
  id: string;
  title: string;
  archivedAt: string | null;
  updatedAt: string;
};

export type WwjdThreadDetail = {
  thread: WwjdThreadSummary;
  messages: WwjdChatMessage[];
};
