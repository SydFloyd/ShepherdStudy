import OpenAI from "openai";
import { z } from "zod";

import { extractScriptureReferencesFromText } from "@/lib/scripture";
import { StudyRecommendation } from "@/lib/study-contract";

const recommendationSchema = z.object({
  reference: z.string().min(1),
  summary: z.string().min(1)
});

const wwjdResponseSchema = z.object({
  reply: z.string().min(1),
  recommendations: z.array(recommendationSchema).min(3).max(8)
});

export type WwjdResponse = {
  reply: string;
  recommendations: StudyRecommendation[];
};

export type WwjdMessage = {
  role: "user" | "assistant";
  content: string;
};

const systemPrompt = `
You are ShepherdAI, an AI assistant that offers a Christ-centered pastoral perspective grounded in Scripture.
Never claim divine identity, infallibility, or prophetic certainty.
Do not say you are emulating Jesus or speaking as Jesus.
Do not contradict Scripture.
Focus on repentance, love, truth, humility, mercy, obedience, and prayer.

Return only valid JSON with shape:
{
  "reply": "response in a Christ-like pastoral tone (Markdown allowed)",
  "recommendations": [
    {
      "reference": "Book Chapter:Verse",
      "summary": "one concise sentence: why this verse applies and how to respond"
    }
  ]
}

Rules:
- Keep response concise and pastoral.
- The "reply" field may use Markdown (paragraphs, bullet lists, emphasis).
- Keep all scripture references (Book Chapter:Verse) in "recommendations" only.
- Do not place "recommended verses", "cross references", or verse lists in "reply".
- Do not present private revelations.
- Provide 5 recommendations.
`.trim();

const RECOMMENDATION_HEADING_RE =
  /^(?:recommended|recommendations|suggested|related|cross(?: |-)?references?)(?: (?:verses?|passages?|references?))?:?$/i;
const MARKDOWN_LIST_PREFIX_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
const FALLBACK_REPLY =
  "Pause to pray, seek wise counsel, and take the next obedient step in love.";
const LEAKED_REFERENCE_SUMMARY =
  "Reflect prayerfully on this passage and apply it with humility and obedience.";

function normalizeReference(reference: string): string {
  return reference.trim().replace(/\s+/g, " ");
}

function dedupeReferences(references: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const reference of references) {
    const normalized = normalizeReference(reference);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

function normalizeHeadingLine(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ");
}

function isReferenceListLine(line: string): boolean {
  const candidate = line.replace(MARKDOWN_LIST_PREFIX_RE, "").trim();
  if (!candidate) {
    return false;
  }

  const extraction = extractScriptureReferencesFromText(candidate);
  if (extraction.references.length === 0) {
    return false;
  }

  const residualAlphaNum = extraction.residualText.replace(/[^a-z0-9]/gi, "");
  return residualAlphaNum.length <= 20;
}

function stripLeakedRecommendationBlock(reply: string): {
  reply: string;
  leakedReferences: string[];
} {
  const original = reply.trim();
  if (!original) {
    return {
      reply: FALLBACK_REPLY,
      leakedReferences: []
    };
  }

  const lines = original.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) =>
    RECOMMENDATION_HEADING_RE.test(normalizeHeadingLine(line))
  );

  let keptLines = lines;
  let removedLines: string[] = [];

  if (headingIndex >= 0) {
    keptLines = lines.slice(0, headingIndex);
    removedLines = lines.slice(headingIndex);
  } else {
    let end = lines.length;
    while (end > 0 && lines[end - 1]?.trim() === "") {
      end -= 1;
    }

    let start = end;
    while (start > 0 && isReferenceListLine(lines[start - 1] ?? "")) {
      start -= 1;
    }

    if (start < end && end - start >= 2) {
      keptLines = [...lines.slice(0, start), ...lines.slice(end)];
      removedLines = lines.slice(start, end);
    }
  }

  const cleanedReply = keptLines.join("\n").trim() || FALLBACK_REPLY;
  const leakedReferences =
    removedLines.length > 0
      ? dedupeReferences(
          extractScriptureReferencesFromText(removedLines.join("\n")).references
        )
      : [];

  return {
    reply: cleanedReply,
    leakedReferences
  };
}

function mergeRecommendations(input: {
  recommendations: Array<{ reference: string; summary: string }>;
  leakedReferences: string[];
}): StudyRecommendation[] {
  const maxRecommendations = 8;
  const merged: StudyRecommendation[] = [];
  const seen = new Set<string>();

  for (const recommendation of input.recommendations) {
    const normalized = normalizeReference(recommendation.reference);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({
      reference: normalized,
      summary: recommendation.summary.trim()
    });
    if (merged.length >= maxRecommendations) {
      return merged;
    }
  }

  for (const leaked of input.leakedReferences) {
    const normalized = normalizeReference(leaked);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({
      reference: normalized,
      summary: LEAKED_REFERENCE_SUMMARY
    });
    if (merged.length >= maxRecommendations) {
      break;
    }
  }

  return merged;
}

function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 2,
    timeout: 20000
  });
}

export async function generateWwjdResponse(input: {
  message: string;
  history: WwjdMessage[];
}): Promise<WwjdResponse> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...input.history.map((item) => ({
      role: item.role,
      content: item.content
    })),
    { role: "user", content: input.message }
  ];

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages,
    temperature: 0.3
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Model returned an empty response.");
  }

  const parsed = JSON.parse(content);
  const response = wwjdResponseSchema.parse(parsed);
  const sanitized = stripLeakedRecommendationBlock(response.reply);
  const mergedRecommendations = mergeRecommendations({
    recommendations: response.recommendations,
    leakedReferences: sanitized.leakedReferences
  });

  return {
    reply: sanitized.reply,
    recommendations: mergedRecommendations
  };
}
