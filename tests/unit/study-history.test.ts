import { describe, expect, it } from "vitest";

import type { BibleSourceInfo } from "@/lib/bible";
import { stripLicensedTextFromStudyResponse } from "@/lib/study-history";

const esvSource: BibleSourceInfo = {
  translation: "esv",
  provider: "esv",
  providerId: "esv",
  title: "English Standard Version",
  vernacularTitle: "English Standard Version",
  languageName: "English",
  languageIso: "eng",
  script: "Latn",
  direction: "ltr",
  year: 2025,
  copyright: "ESV copyright notice"
};

describe("study history licensed text storage", () => {
  it("keeps ESV references and derived work without persisting quotations", () => {
    const passage = {
      origin: "input" as const,
      reference: "John 3:16",
      chapterReference: "John 3",
      translation: "esv",
      translationName: "English Standard Version",
      source: esvSource,
      verses: [
        {
          verse: 16,
          paragraph: 1,
          text: "For God so loved the world.",
          notes: []
        }
      ],
      chapterPath: "/passage/john/3?translation=esv"
    };
    const stored = stripLicensedTextFromStudyResponse({
      mode: "passage_only",
      modeName: "Passage Companion",
      assistantBehaviorName: "Context & Companion",
      answer: "A derived study answer.",
      context: "",
      relevance: "",
      passages: [passage],
      passage,
      recommendations: [
        {
          reference: "Romans 5:8",
          preview: "A raw ESV preview.",
          translation: "esv",
          translationName: "English Standard Version",
          source: esvSource
        }
      ],
      saved: true
    });

    expect(stored.passages?.[0].verses).toEqual([]);
    expect(stored.passage?.verses).toEqual([]);
    expect(stored.recommendations[0].preview).toBeUndefined();
    expect(stored.passage?.reference).toBe("John 3:16");
    expect(stored.answer).toBe("A derived study answer.");
  });
});
