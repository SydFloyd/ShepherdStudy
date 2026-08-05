import OpenAI from "openai";
import { z } from "zod";

import { getOpenAIModelForTier } from "@/lib/model-tier";
import type { MemorizationRecommendation } from "@/lib/memorization-data";
import type { QuotaTier } from "@/lib/quota";

const responseSchema = z.object({
  recommendations: z
    .array(
      z.object({
        reference: z.string().trim().min(1).max(120),
        reason: z.string().trim().min(1).max(240)
      })
    )
    .min(3)
    .max(7)
});

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  return new OpenAI({
    apiKey,
    organization: process.env.OPENAI_ORGANIZATION?.trim() || undefined,
    project: process.env.OPENAI_PROJECT?.trim() || undefined,
    maxRetries: 2,
    timeout: 20_000
  });
}

export async function generateMemorizationRecommendations(input: {
  savedReferences: string[];
  translation: string;
  tier: QuotaTier;
}): Promise<{ model: string; recommendations: MemorizationRecommendation[] }> {
  const model = getOpenAIModelForTier(input.tier);
  const completion = await getClient().chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You assist a Christian Scripture memorization tool. Return only valid JSON with this shape: {"recommendations":[{"reference":"Book Chapter:Verse-Verse","reason":"one short sentence"}]}. Write every reference with its canonical English Protestant book name regardless of the user's language or selected Bible (for example, "1 Peter 1:3-5", never "1 Pedro 1:3-5"). Recommend exactly five compact, contiguous Bible passages, normally one to eight verses. Do not repeat or overlap the saved passages. Prefer passages that build a balanced foundation in the gospel, trust in God, prayer, holiness, love, wisdom, and faithful life in the local church. Keep recommendations rooted in historic orthodox Christianity. Reasons are assistive suggestions, not claims of divine or pastoral authority. Do not quote Bible text.`
      },
      {
        role: "user",
        content: `Preferred translation: ${input.translation.toUpperCase()}\nSaved memorization passages:\n${input.savedReferences.map((reference) => `- ${reference}`).join("\n")}`
      }
    ]
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Model returned empty memorization recommendations.");
  }

  return {
    model,
    recommendations: responseSchema.parse(JSON.parse(content)).recommendations
  };
}
