import OpenAI from "openai";
import { z } from "zod";

import { StudyMode } from "@/lib/study-contract";

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
- When prior study-step history is provided, maintain continuity with it and avoid contradicting previous guidance unless correcting an error.
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
