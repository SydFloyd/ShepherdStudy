import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import {
  BIBLE_TRANSLATION_IDS,
  DEFAULT_BIBLE_TRANSLATION,
  isTranslationCompatibleWithBook
} from "@/lib/bible";
import { resolvePassageFromLocalBible } from "@/lib/local-bible";
import { getRequestMeta, logEvent } from "@/lib/logger";
import { generateStudyRecommendations } from "@/lib/openai";
import { consumeQuota } from "@/lib/quota";
import { getRequestId } from "@/lib/request-context";
import { parseScriptureReference } from "@/lib/scripture";
import { StudyMode, StudyPassageResult } from "@/lib/study-contract";
import { persistStudyTurn } from "@/lib/study-history";
import { captureServerException } from "@/lib/sentry";
import { resolveActiveUserId } from "@/lib/session-user";

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
      .max(200)
      .optional()
      .default([]),
    translation: z
      .enum(BIBLE_TRANSLATION_IDS)
      .default(DEFAULT_BIBLE_TRANSLATION),
    threadId: z.string().trim().cuid().optional(),
    kind: z.enum(["prompt", "verse"]).optional(),
    userText: z.string().trim().max(4000).optional().or(z.literal(""))
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

function getRecommendationTranslation(reference: string, translation: string): string {
  const parsed = parseScriptureReference(reference);
  if (!parsed) {
    return translation;
  }

  if (isTranslationCompatibleWithBook(translation, parsed.book)) {
    return translation;
  }

  if (translation === "uhb") {
    return "ugnt";
  }
  if (translation === "ugnt") {
    return "uhb";
  }

  return translation;
}

export async function POST(req: Request) {
  const requestId = await getRequestId();
  const requestMeta = getRequestMeta({
    requestId,
    route: "/api/study",
    method: req.method
  });

  try {
    logEvent("info", "study.start", requestMeta);
    const json = await req.json();
    const input = inputSchema.parse(json);
    const session = await getServerSession(authOptions);
    const userId = await resolveActiveUserId(session?.user?.id);
    const quotaDecision = await consumeQuota({
      request: req,
      userId,
      feature: "STUDY"
    });

    if (!quotaDecision.allowed) {
      logEvent("warn", "study.quota_block", {
        ...requestMeta,
        reason: quotaDecision.reason
      });
      return NextResponse.json(
        {
          error:
            quotaDecision.reason === "daily_limit"
              ? "Daily study limit reached. Please try again tomorrow."
              : "Too many study requests in a short period. Please wait and retry.",
          quota: quotaDecision
        },
        {
          status: 429,
          headers: { "Retry-After": String(quotaDecision.retryAfterSeconds) }
        }
      );
    }

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
        reference: resolution.resolvedReference,
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
          reference: anchor.resolvedReference,
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
    const filteredRecommendations = response.recommendations.filter((item) => {
      if (!normalizedAnchorReference) {
        return true;
      }
      const normalizedReference = item.reference
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      return normalizedReference !== normalizedAnchorReference;
    });
    const recommendations = await Promise.all(
      filteredRecommendations.map(async (item) => {
        const selectionTranslation = getRecommendationTranslation(
          item.reference,
          input.translation
        );
        const preview = await resolvePassageFromLocalBible({
          reference: item.reference,
          translation: selectionTranslation
        });

        if (!preview.ok) {
          return {
            reference: item.reference
          };
        }

        const previewText =
          preview.selectedVerses[0]?.text ?? preview.chapterVerses[0]?.text ?? "";

        return {
          reference: preview.resolvedReference,
          preview: previewText
        };
      })
    );

    let thread: {
      id: string;
      title: string;
      translation: string | null;
      archivedAt: string | null;
      updatedAt: string;
    } | null = null;

    if (userId) {
      const turnKind = input.kind ?? (normalizedPrompt ? "prompt" : "verse");
      const userText =
        input.userText?.trim() ||
        (turnKind === "verse"
          ? `Selected verse: ${passagePayload?.reference ?? normalizedPassage ?? "Unknown passage"}`
          : normalizedPrompt || normalizedPassage || "Study prompt");

      thread = await persistStudyTurn({
        userId,
        threadId: input.threadId,
        kind: turnKind,
        userText,
        passage: passagePayload?.reference ?? normalizedPassage,
        translation: input.translation,
        response: {
          mode,
          modeName: modeMeta.modeName,
          assistantBehaviorName: modeMeta.assistantBehaviorName,
          answer: response.answer,
          context: "",
          relevance: "",
          recommendations,
          passage: passagePayload,
          saved: true
        }
      });
    }

    const payload = {
      mode,
      modeName: modeMeta.modeName,
      assistantBehaviorName: modeMeta.assistantBehaviorName,
      answer: response.answer,
      context: "",
      relevance: "",
      recommendations,
      passage: passagePayload,
      quota: quotaDecision,
      saved: Boolean(thread),
      thread:
        thread && {
          id: thread.id,
          title: thread.title,
          archivedAt: thread.archivedAt,
          updatedAt: thread.updatedAt
        }
    };

    logEvent("info", "study.ok", {
      ...requestMeta,
      mode,
      recommendations: recommendations.length,
      saved: Boolean(thread)
    });

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      logEvent("warn", "study.invalid_input", requestMeta);
      return NextResponse.json(
        { error: "Invalid study request. Provide a passage, a prompt, or both." },
        { status: 400 }
      );
    }

    captureServerException(error, {
      route: "/api/study",
      requestId
    });
    logEvent("error", "study.failure", { ...requestMeta, error });
    return NextResponse.json(
      { error: "Unable to generate study recommendations right now." },
      { status: 500 }
    );
  }
}
