import OpenAI from "openai";
import { z } from "zod";

import { extractScriptureReferencesFromText } from "@/lib/scripture";
import { StudyMode } from "@/lib/study-contract";

const recommendationSchema = z.object({
  reference: z.string().min(1)
});

const studyResponseSchema = z.object({
  answer: z.string().min(1),
  // context: z.string().min(1), // Disabled for now to reduce token usage.
  // relevance: z.string().min(1), // Disabled for now to reduce token usage.
  recommendations: z.array(recommendationSchema).min(3).max(10)
});

export type StudyRecommendation = z.infer<typeof recommendationSchema>;
export type StudyResponse = z.infer<typeof studyResponseSchema>;

const systemPrompt = `
You are a biblical study assistant.
Return only valid JSON with this shape:
{
  "answer": "direct response to the user's prompt (Markdown allowed)",
  // "context": "disabled for now",
  // "relevance": "disabled for now",
  "recommendations": [
    {
      "reference": "Book Chapter:Verse"
    }
  ]
}

Rules:
- Keep references orthodox and scripture-focused.
- Avoid speculative claims.
- Keep answer concise and practical.
- Assume the user is a Christian believer seeking faithful understanding and obedience.
- Use a warm, humble, convictional Christian tone instead of detached or agnostic framing.
- For apologetics questions, answer from a historic orthodox Christian perspective with Scripture-grounded reasons.
- You may briefly acknowledge common objections, but do not frame core Christian claims as doubtful for this audience.
- In recommendations, prioritize passages that strengthen confidence in Christ, Scripture, and sound doctrine.
- The "answer" field may use Markdown (paragraphs, bullet lists, emphasis).
- Keep all scripture references (Book Chapter:Verse) in "recommendations" only.
- Do not place "recommended verses", "cross references", or verse lists in "answer".
- Do not include recommendation summaries or explanations.
- Provide 5 recommendations.
- When prior study-step history is provided, maintain continuity with it and avoid contradicting previous guidance unless correcting an error.
`.trim();

const RECOMMENDATION_HEADING_RE =
  /^(?:recommended|recommendations|suggested|related|cross(?: |-)?references?)(?: (?:verses?|passages?|references?))?:?$/i;
const MARKDOWN_LIST_PREFIX_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;
const FALLBACK_ANSWER =
  "Reflect prayerfully on these passages and ask God for wisdom, obedience, and love in your next step.";

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

function stripLeakedRecommendationBlock(answer: string): {
  answer: string;
  leakedReferences: string[];
} {
  const original = answer.trim();
  if (!original) {
    return {
      answer: FALLBACK_ANSWER,
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

  const cleanedAnswer = keptLines.join("\n").trim() || FALLBACK_ANSWER;
  const leakedReferences =
    removedLines.length > 0
      ? dedupeReferences(
          extractScriptureReferencesFromText(removedLines.join("\n")).references
        )
      : [];

  return {
    answer: cleanedAnswer,
    leakedReferences
  };
}

function mergeRecommendations(input: {
  recommendations: StudyRecommendation[];
  leakedReferences: string[];
}): StudyRecommendation[] {
  const maxRecommendations = 10;
  const merged: StudyRecommendation[] = [];
  const seen = new Set<string>();

  for (const recommendation of input.recommendations) {
    const normalized = normalizeReference(recommendation.reference);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push({ reference: normalized });
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
    merged.push({ reference: normalized });
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

  const organization = process.env.OPENAI_ORGANIZATION?.trim();
  const project = process.env.OPENAI_PROJECT?.trim();

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    organization: organization || undefined,
    project: project || undefined,
    maxRetries: 2,
    timeout: 20000
  });
}

export async function generateStudyRecommendations(input: {
  mode: StudyMode;
  passage?: string;
  passages?: string[];
  prompt?: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}): Promise<StudyResponse> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const passages = (input.passages ?? []).filter((item) => item.trim().length > 0);
  const passageList =
    passages.length > 0
      ? passages.join("; ")
      : input.passage
        ? input.passage
        : "None provided";

  const userPrompt = `
Study mode: ${input.mode}
Passages to study: ${passageList}
User prompt: ${input.prompt ?? "None provided"}

Mode guidance:
- passage_only: explain the passage theme and practical obedience steps.
- prompt_only: answer the question broadly from Scripture with strong cross-reference coverage and gentle believer-oriented apologetics when relevant.
- passage_and_prompt: explicitly connect the question to this passage and then broaden with related Scripture.
  `.trim();

  const historyMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] =
    (input.history ?? []).map((message) => ({
      role: message.role,
      content: message.content
    }));

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Model returned an empty response.");
  }

  const parsed = JSON.parse(content);
  const response = studyResponseSchema.parse(parsed);
  const sanitized = stripLeakedRecommendationBlock(response.answer);
  const mergedRecommendations = mergeRecommendations({
    recommendations: response.recommendations,
    leakedReferences: sanitized.leakedReferences
  });

  return {
    answer: sanitized.answer,
    recommendations: mergedRecommendations
  };
}
