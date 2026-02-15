import OpenAI from "openai";
import { z } from "zod";

import { OriginalLanguageInsight, StudyMode } from "@/lib/study-contract";

const recommendationSchema = z.object({
  reference: z.string().min(1),
  summary: z.string().min(1)
});

const studyResponseSchema = z.object({
  answer: z.string().min(1),
  context: z.string().min(1),
  relevance: z.string().min(1),
  recommendations: z.array(recommendationSchema).min(3).max(10)
});

export type StudyRecommendation = z.infer<typeof recommendationSchema>;
export type StudyResponse = z.infer<typeof studyResponseSchema>;

const originalLanguageInsightSchema = z.object({
  summary: z.string().min(1),
  nuances: z.array(z.string().min(1)).min(1).max(6),
  translationNotes: z.array(z.string().min(1)).min(1).max(6),
  wordHighlights: z
    .array(
      z.object({
        term: z.string().min(1),
        note: z.string().min(1),
        lemma: z.string().min(1).nullable().optional(),
        strong: z.string().min(1).nullable().optional(),
        morph: z.string().min(1).nullable().optional()
      })
    )
    .max(6)
});

const systemPrompt = `
You are a biblical study assistant.
Return only valid JSON with this shape:
{
  "answer": "direct response to the user's prompt",
  "context": "biblical context and interpretation context",
  "relevance": "why this matters for the user's situation",
  "recommendations": [
    {
      "reference": "Book Chapter:Verse",
      "summary": "one concise sentence: why this verse fits and how to apply it"
    }
  ]
}

Rules:
- Keep references orthodox and scripture-focused.
- Avoid speculative claims.
- Keep answer/context/relevance concise and practical.
- Provide 5 recommendations.
`.trim();

const originalLanguageSystemPrompt = `
You are a biblical language assistant helping users compare an English translation with original-language source text.
Return only valid JSON with this shape:
{
  "summary": "concise high-value interpretation note",
  "nuances": ["translation nuance or semantic force", "..."],
  "translationNotes": ["possible alternate rendering or clarity note", "..."],
  "wordHighlights": [
    {
      "term": "surface original term",
      "note": "brief explanation",
      "lemma": "lemma if available",
      "strong": "Strong code if available",
      "morph": "morph tag if available"
    }
  ]
}

Rules:
- Be faithful to orthodox Christian interpretation and textual context.
- Prefer clarity over jargon, but use technical terms when necessary.
- Do not invent lexical data.
- Keep each bullet concise and useful for study.
`.trim();

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

export async function generateStudyRecommendations(input: {
  mode: StudyMode;
  passage?: string;
  prompt?: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}): Promise<StudyResponse> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const userPrompt = `
Study mode: ${input.mode}
Passage to study: ${input.passage ?? "None provided"}
User prompt: ${input.prompt ?? "None provided"}

Mode guidance:
- passage_only: explain the passage theme, context, and practical obedience steps.
- prompt_only: answer the question broadly from Scripture with strong cross-reference coverage.
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
  return studyResponseSchema.parse(parsed);
}

export async function generateOriginalLanguageInsight(input: {
  selectedTranslation: string;
  selectedTranslationName: string;
  chapterReference: string;
  selectedVerses: Array<{
    verse: number;
    text: string;
  }>;
  sourceTranslation: string;
  sourceTranslationName: string;
  sourceVerses: Array<{
    verse: number;
    text: string;
    words: Array<{
      position: number;
      text: string;
      lemma: string | null;
      strong: string | null;
      morph: string | null;
    }>;
  }>;
}): Promise<OriginalLanguageInsight> {
  const client = getClient();
  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  const selectedVerses = input.selectedVerses.slice(0, 12);
  const sourceVerses = input.sourceVerses.slice(0, 12).map((verse) => ({
    verse: verse.verse,
    text: verse.text,
    words: verse.words.slice(0, 70)
  }));

  const userPrompt = `
Passage: ${input.chapterReference}
Selected translation: ${input.selectedTranslationName} (${input.selectedTranslation})
Original source: ${input.sourceTranslationName} (${input.sourceTranslation})

Selected translation verses:
${JSON.stringify(selectedVerses)}

Original source verses with word data:
${JSON.stringify(sourceVerses)}
`.trim();

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: originalLanguageSystemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.2
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Model returned an empty response for original-language insight.");
  }

  const parsed = originalLanguageInsightSchema.parse(JSON.parse(content));
  return {
    panelName: "Original Language Lens",
    sourceTranslation: input.sourceTranslation,
    sourceTranslationName: input.sourceTranslationName,
    summary: parsed.summary,
    nuances: parsed.nuances,
    translationNotes: parsed.translationNotes,
    wordHighlights: parsed.wordHighlights.map((item) => ({
      term: item.term,
      note: item.note,
      lemma: item.lemma ?? null,
      strong: item.strong ?? null,
      morph: item.morph ?? null
    }))
  };
}
