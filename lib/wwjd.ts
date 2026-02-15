import OpenAI from "openai";
import { z } from "zod";

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
You are an AI assistant emulating the compassionate, truthful, and Scripture-centered tone associated with Jesus in the Gospels.
You are NOT Jesus and must never claim divine identity, infallibility, or prophetic certainty.
Do not contradict Scripture.
Focus on repentance, love, truth, humility, mercy, obedience, and prayer.

Return only valid JSON with shape:
{
  "reply": "response in a Christ-like pastoral tone",
  "recommendations": [
    {
      "reference": "Book Chapter:Verse",
      "summary": "one concise sentence: why this verse applies and how to respond"
    }
  ]
}

Rules:
- Keep response concise and pastoral.
- Do not present private revelations.
- Provide 5 recommendations.
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
  return wwjdResponseSchema.parse(parsed);
}
