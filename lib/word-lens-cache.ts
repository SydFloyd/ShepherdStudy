import { createHash, randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";

const CACHE_TTL_HOURS = Number(process.env.WORD_LENS_CACHE_TTL_HOURS ?? 168);
const PROMPT_VERSION = "word-lens-v7";
const CACHE_ALIAS_VERSION = 1;

type WordLensCacheAlias = {
  __wordLensCacheAlias: typeof CACHE_ALIAS_VERSION;
  canonicalCacheKey: string;
};

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
  const raw = JSON.stringify({
    kind: input.kind,
    reference: input.reference.trim(),
    sourceTranslation: input.sourceTranslation.trim(),
    targetTranslation: input.targetTranslation.trim(),
    model: input.model.trim(),
    promptVersion: input.promptVersion.trim()
  });
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
    const payload = rows[0]?.payload;
    if (!payload) {
      return null;
    }

    if (isWordLensCacheAlias(payload)) {
      const canonicalRows = (await prisma.$queryRaw`
        SELECT "payload"
        FROM "WordLensCache"
        WHERE "cacheKey" = ${payload.canonicalCacheKey}
          AND "expiresAt" > NOW()
        LIMIT 1
      `) as Array<{ payload: T }>;
      return canonicalRows[0]?.payload ?? null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function isWordLensCacheAlias(
  payload: unknown
): payload is WordLensCacheAlias {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const candidate = payload as Record<string, unknown>;
  return (
    candidate.__wordLensCacheAlias === CACHE_ALIAS_VERSION &&
    typeof candidate.canonicalCacheKey === "string" &&
    /^[a-f0-9]{64}$/.test(candidate.canonicalCacheKey)
  );
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

export async function writeWordLensCacheAlias(input: {
  cacheKey: string;
  canonicalCacheKey: string;
  kind: "full" | "map";
  reference: string;
  sourceTranslation: string;
  targetTranslation: string;
  model: string;
  promptVersion: string;
}) {
  if (input.cacheKey === input.canonicalCacheKey) {
    return;
  }

  await writeWordLensCache({
    cacheKey: input.cacheKey,
    kind: input.kind,
    reference: input.reference,
    sourceTranslation: input.sourceTranslation,
    targetTranslation: input.targetTranslation,
    model: input.model,
    promptVersion: input.promptVersion,
    payload: {
      __wordLensCacheAlias: CACHE_ALIAS_VERSION,
      canonicalCacheKey: input.canonicalCacheKey
    } satisfies WordLensCacheAlias
  });
}
