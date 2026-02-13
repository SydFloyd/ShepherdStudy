import { NextResponse } from "next/server";
import { z } from "zod";

import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION
} from "@/lib/bible";
import { resolvePassageFromLocalBible } from "@/lib/local-bible";
import { generateStudyRecommendations } from "@/lib/openai";
import { StudyMode, StudyPassageResult } from "@/lib/study-contract";

const inputSchema = z
  .object({
    passage: z.string().trim().max(120).optional().or(z.literal("")),
    prompt: z.string().trim().max(3000).optional().or(z.literal("")),
    history: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(4000)
        })
      )
      .max(24)
      .optional()
      .default([]),
    translation: z
      .enum(BIBLE_TRANSLATION_IDS)
      .default(DEFAULT_BIBLE_TRANSLATION)
  })
  .refine((value) => Boolean(value.passage?.trim() || value.prompt?.trim()), {
    message: "Please provide a passage, a prompt, or both.",
    path: ["passage"]
  });

function getStudyMode(input: {
  passage?: string;
  prompt?: string;
}): StudyMode {
  if (input.passage && input.prompt) {
    return "passage_and_prompt";
  }
  if (input.passage) {
    return "passage_only";
  }
  return "prompt_only";
}

function getModeMetadata(mode: StudyMode): {
  modeName: string;
  assistantBehaviorName: string;
  effectivePrompt: string;
} {
  if (mode === "passage_only") {
    return {
      modeName: "Passage Companion",
      assistantBehaviorName: "Context & Companion",
      effectivePrompt:
        "Explain this passage in context and provide practical obedience applications."
    };
  }

  if (mode === "prompt_only") {
    return {
      modeName: "Topical Discovery",
      assistantBehaviorName: "Topical Scout",
      effectivePrompt: ""
    };
  }

  return {
    modeName: "Passage-Anchored Inquiry",
    assistantBehaviorName: "Triangulated Guidance",
    effectivePrompt: ""
  };
}

function buildInputPassagePayload(input: {
  reference: string;
  chapterReference: string;
  translation: string;
  translationName: string;
  verses: StudyPassageResult["verses"];
  chapterPath: string | null;
}): StudyPassageResult {
  return {
    origin: "input",
    reference: input.reference,
    chapterReference: input.chapterReference,
    translation: input.translation,
    translationName: input.translationName,
    verses: input.verses,
    chapterPath: input.chapterPath
  };
}

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = inputSchema.parse(json);
    const normalizedPassage = input.passage?.trim() || undefined;
    const normalizedPrompt = input.prompt?.trim() || undefined;
    const mode = getStudyMode({
      passage: normalizedPassage,
      prompt: normalizedPrompt
    });
    const modeMeta = getModeMetadata(mode);
    const effectivePrompt =
      mode === "passage_only" ? modeMeta.effectivePrompt : normalizedPrompt ?? "";

    let passagePayload: StudyPassageResult | null = null;

    if (normalizedPassage) {
      const resolution = await resolvePassageFromLocalBible({
        reference: normalizedPassage,
        translation: input.translation
      });

      if (!resolution.ok) {
        return NextResponse.json(
          { error: resolution.message },
          { status: resolution.reason === "invalid_reference" ? 400 : 404 }
        );
      }

      passagePayload = buildInputPassagePayload({
        reference: normalizedPassage,
        chapterReference: resolution.chapterReference,
        translation: input.translation,
        translationName: resolution.translationName,
        verses: resolution.selectedVerses,
        chapterPath: resolution.chapterPath
      });
    }

    const response = await generateStudyRecommendations({
      mode,
      passage: normalizedPassage,
      prompt: effectivePrompt,
      history: input.history
    });

    if (!passagePayload && response.recommendations.length > 0) {
      for (const recommendation of response.recommendations) {
        const anchor = await resolvePassageFromLocalBible({
          reference: recommendation.reference,
          translation: input.translation
        });
        if (!anchor.ok) {
          continue;
        }

        const verses = anchor.parsed.verseStart
          ? anchor.selectedVerses
          : anchor.chapterVerses.slice(0, 12);

        passagePayload = {
          origin: "anchor",
          reference: recommendation.reference,
          chapterReference: anchor.chapterReference,
          translation: input.translation,
          translationName: anchor.translationName,
          verses,
          chapterPath: anchor.chapterPath,
          excerpted: !anchor.parsed.verseStart
        };
        break;
      }
    }

    const normalizedAnchorReference = passagePayload?.reference
      ? passagePayload.reference.trim().replace(/\s+/g, " ").toLowerCase()
      : null;
    const recommendations = response.recommendations.filter((item) => {
      if (!normalizedAnchorReference) {
        return true;
      }
      const normalizedReference = item.reference
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      return normalizedReference !== normalizedAnchorReference;
    });

    const saved = false;
    const graph = undefined;

    return NextResponse.json({
      mode,
      modeName: modeMeta.modeName,
      assistantBehaviorName: modeMeta.assistantBehaviorName,
      answer: response.answer,
      context: response.context,
      relevance: response.relevance,
      recommendations,
      passage: passagePayload,
      graph,
      saved
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid study request. Provide a passage, a prompt, or both." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Unable to generate study recommendations right now." },
      { status: 500 }
    );
  }
}
