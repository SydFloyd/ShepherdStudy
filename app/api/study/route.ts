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
import {
  extractScriptureReferencesFromText,
  hasMeaningfulPromptText,
  parseScriptureReference
} from "@/lib/scripture";
import { StudyMode, StudyPassageResult } from "@/lib/study-contract";
import { persistStudyTurn } from "@/lib/study-history";
import { captureServerException } from "@/lib/sentry";
import { resolveActiveUserId } from "@/lib/session-user";
import { trackUsageSuccess } from "@/lib/usage-tracking";

const inputSchema = z
  .object({
    passage: z.string().trim().max(120).optional().or(z.literal("")),
    passages: z
      .array(z.string().trim().min(1).max(120))
      .max(8)
      .optional()
      .default([]),
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
  .refine(
    (value) =>
      Boolean(
        value.passage?.trim() || value.prompt?.trim() || value.passages.length > 0
      ),
    {
    message: "Please provide a passage, a prompt, or both.",
    path: ["passage"]
    }
  );

function getStudyMode(input: {
  hasPassages: boolean;
  promptText?: string;
}): StudyMode {
  if (input.hasPassages && input.promptText) {
    return "passage_and_prompt";
  }
  if (input.hasPassages) {
    return "passage_only";
  }
  return "prompt_only";
}

function normalizeReferences(references: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of references) {
    const reference = item.trim().replace(/\s+/g, " ");
    if (!reference) {
      continue;
    }

    const key = reference.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(reference);
  }

  return normalized;
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

    const normalizedPrompt = input.prompt?.trim() || "";
    const promptExtraction = extractScriptureReferencesFromText(normalizedPrompt);
    const normalizedPassages = normalizeReferences([
      ...input.passages,
      input.passage?.trim() || "",
      ...promptExtraction.references
    ]).slice(0, 8);
    const promptWithoutReferences = promptExtraction.residualText;
    const hasPromptText = hasMeaningfulPromptText(promptWithoutReferences);
    const mode = getStudyMode({
      hasPassages: normalizedPassages.length > 0,
      promptText: hasPromptText ? promptWithoutReferences : undefined
    });
    const modeMeta = getModeMetadata(mode);
    const effectivePrompt =
      mode === "passage_only" ? modeMeta.effectivePrompt : normalizedPrompt;

    const inputPassages: StudyPassageResult[] = [];
    let firstResolutionFailure: {
      message: string;
      status: number;
    } | null = null;

    for (const reference of normalizedPassages) {
      const resolution = await resolvePassageFromLocalBible({
        reference,
        translation: input.translation
      });

      if (!resolution.ok) {
        if (!firstResolutionFailure) {
          firstResolutionFailure = {
            message: resolution.message,
            status: resolution.reason === "invalid_reference" ? 400 : 404
          };
        }
        continue;
      }

      inputPassages.push(
        buildInputPassagePayload({
          reference: resolution.resolvedReference,
          chapterReference: resolution.chapterReference,
          translation: input.translation,
          translationName: resolution.translationName,
          verses: resolution.selectedVerses,
          chapterPath: resolution.chapterPath
        })
      );
    }

    if (normalizedPassages.length > 0 && inputPassages.length === 0) {
      return NextResponse.json(
        { error: firstResolutionFailure?.message ?? "Unable to resolve passages." },
        { status: firstResolutionFailure?.status ?? 404 }
      );
    }

    let passagesPayload = inputPassages;
    let passagePayload = passagesPayload[0] ?? null;

    const response = await generateStudyRecommendations({
      mode,
      passage: passagesPayload[0]?.reference,
      passages: passagesPayload.map((item) => item.reference),
      prompt: effectivePrompt,
      history: input.history
    });

    if (passagesPayload.length === 0 && response.recommendations.length > 0) {
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

        passagesPayload = [
          {
          origin: "anchor",
          reference: anchor.resolvedReference,
          chapterReference: anchor.chapterReference,
          translation: input.translation,
          translationName: anchor.translationName,
          verses,
          chapterPath: anchor.chapterPath,
          excerpted: !anchor.parsed.verseStart
        }
        ];
        passagePayload = passagesPayload[0];
        break;
      }
    }

    const normalizedAnchorReferences = new Set(
      passagesPayload.map((item) =>
        item.reference.trim().replace(/\s+/g, " ").toLowerCase()
      )
    );
    const filteredRecommendations = response.recommendations.filter((item) => {
      if (normalizedAnchorReferences.size === 0) {
        return true;
      }
      const normalizedReference = item.reference
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      return !normalizedAnchorReferences.has(normalizedReference);
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
      const turnKind = input.kind ?? (mode === "passage_only" ? "verse" : "prompt");
      const selectedReferenceText =
        passagesPayload.length > 0
          ? passagesPayload.map((item) => item.reference).join("; ")
          : normalizedPassages.join("; ");
      const userText =
        input.userText?.trim() ||
        (turnKind === "verse"
          ? `Selected verse${passagesPayload.length > 1 ? "s" : ""}: ${selectedReferenceText || "Unknown passage"}`
          : normalizedPrompt || selectedReferenceText || "Study prompt");

      thread = await persistStudyTurn({
        userId,
        threadId: input.threadId,
        kind: turnKind,
        userText,
        passage: passagesPayload[0]?.reference ?? normalizedPassages[0],
        passages:
          passagesPayload.length > 0
            ? passagesPayload.map((item) => item.reference)
            : normalizedPassages,
        translation: input.translation,
        response: {
          mode,
          modeName: modeMeta.modeName,
          assistantBehaviorName: modeMeta.assistantBehaviorName,
          answer: response.answer,
          context: "",
          relevance: "",
          recommendations,
          passages: passagesPayload,
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
      passages: passagesPayload,
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
      passages: passagesPayload.length,
      recommendations: recommendations.length,
      saved: Boolean(thread)
    });

    await trackUsageSuccess({
      request: req,
      feature: "STUDY",
      pagePath: "/study",
      apiRoute: "/api/study",
      action: "submit",
      userId,
      requestId
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
