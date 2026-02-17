import { createHash, randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

const CACHE_TTL_HOURS = Number(process.env.WORD_LENS_CACHE_TTL_HOURS ?? 168);
const PROMPT_VERSION = "word-lens-v3";

export function getWordLensPromptVersion() {
  return PROMPT_VERSION;
}

function getTtlHours() {
  if (Number.isFinite(CACHE_TTL_HOURS) && CACHE_TTL_HOURS > 0) {
    return CACHE_TTL_HOURS;
  }
  return 168;
}

export function buildWordLensCacheKey(input: {
  kind: "full" | "map";
  reference: string;
  sourceTranslation: string;
  targetTranslation: string;
  model: string;
  promptVersion: string;
}) {
  const raw = [
    input.kind,
    input.reference.trim().toLowerCase(),
    input.sourceTranslation.trim().toLowerCase(),
    input.targetTranslation.trim().toLowerCase(),
    input.model.trim().toLowerCase(),
    input.promptVersion.trim().toLowerCase()
  ].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

export async function readWordLensCache<T>(input: {
  cacheKey: string;
}): Promise<T | null> {
  try {
    const rows = (await prisma.$queryRaw`
      SELECT "payload"
      FROM "WordLensCache"
      WHERE "cacheKey" = ${input.cacheKey}
        AND "expiresAt" > NOW()
      LIMIT 1
    `) as Array<{ payload: T }>;
    return rows[0]?.payload ?? null;
  } catch {
    return null;
  }
}

export async function writeWordLensCache(input: {
  cacheKey: string;
  kind: "full" | "map";
  reference: string;
  sourceTranslation: string;
  targetTranslation: string;
  model: string;
  promptVersion: string;
  payload: unknown;
}) {
  const ttlHours = getTtlHours();
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  const payloadJson = JSON.stringify(input.payload);

  try {
    await prisma.$executeRaw`
      INSERT INTO "WordLensCache" (
        "id",
        "cacheKey",
        "kind",
        "reference",
        "sourceTranslation",
        "targetTranslation",
        "model",
        "promptVersion",
        "payload",
        "expiresAt",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${randomUUID()},
        ${input.cacheKey},
        ${input.kind},
        ${input.reference},
        ${input.sourceTranslation},
        ${input.targetTranslation},
        ${input.model},
        ${input.promptVersion},
        CAST(${payloadJson} AS jsonb),
        ${expiresAt},
        NOW(),
        NOW()
      )
      ON CONFLICT ("cacheKey")
      DO UPDATE SET
        "payload" = EXCLUDED."payload",
        "expiresAt" = EXCLUDED."expiresAt",
        "updatedAt" = NOW()
    `;
  } catch {
    // Cache failures should not break response path.
  }
}
