import type { QuotaTier } from "@/lib/quota";

export function getOpenAIModelForTier(tier: QuotaTier) {
  const standardModel = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini";
  if (tier !== "PAID") {
    return standardModel;
  }
  return process.env.OPENAI_PAID_MODEL?.trim() || standardModel;
}
