import { QuotaFeature } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const DAILY_LIMITS: Record<QuotaFeature, number> = {
  STUDY: Number(process.env.STUDY_DAILY_LIMIT ?? 40),
  WWJD: Number(process.env.WWJD_DAILY_LIMIT ?? 80)
};

const BURST_PER_MINUTE: Record<QuotaFeature, number> = {
  STUDY: Number(process.env.STUDY_BURST_PER_MINUTE ?? 8),
  WWJD: Number(process.env.WWJD_BURST_PER_MINUTE ?? 12)
};

type QuotaDecision =
  | {
      allowed: true;
      feature: QuotaFeature;
      limit: number;
      remaining: number;
      resetAt: string;
    }
  | {
      allowed: false;
      feature: QuotaFeature;
      limit: number;
      remaining: number;
      resetAt: string;
      reason: "daily_limit" | "burst_limit";
      retryAfterSeconds: number;
    };

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nextUtcDayStart(date: Date) {
  const start = startOfUtcDay(date);
  start.setUTCDate(start.getUTCDate() + 1);
  return start;
}

function getActorKey(input: { userId?: string | null; request: Request }) {
  if (input.userId) {
    return `user:${input.userId}`;
  }

  const forwardedFor = input.request.headers.get("x-forwarded-for");
  const firstIp = forwardedFor?.split(",")[0]?.trim();
  const userAgent = input.request.headers.get("user-agent") ?? "unknown";
  return `anon:${firstIp ?? "unknown-ip"}:${userAgent.slice(0, 48)}`;
}

export const __testables = {
  startOfUtcDay,
  nextUtcDayStart,
  getActorKey
};

export async function consumeQuota(input: {
  request: Request;
  userId?: string | null;
  feature: QuotaFeature;
  tokenCount?: number;
}): Promise<QuotaDecision> {
  const now = new Date();
  const day = startOfUtcDay(now);
  const resetAt = nextUtcDayStart(now).toISOString();
  const actorKey = getActorKey({
    userId: input.userId,
    request: input.request
  });

  const limit = DAILY_LIMITS[input.feature];
  const burstLimit = BURST_PER_MINUTE[input.feature];
  const oneMinuteMs = 60_000;

  const decision = await prisma.$transaction(async (tx) => {
    const usage = await tx.dailyQuotaUsage.findUnique({
      where: {
        actorKey_feature_day: {
          actorKey,
          feature: input.feature,
          day
        }
      }
    });

    if (!usage) {
      await tx.dailyQuotaUsage.create({
        data: {
          actorKey,
          userId: input.userId ?? null,
          feature: input.feature,
          day,
          requestCount: 1,
          tokenCount: input.tokenCount ?? 0,
          windowStart: now,
          windowCount: 1
        }
      });

      return {
        allowed: true as const,
        feature: input.feature,
        limit,
        remaining: Math.max(0, limit - 1),
        resetAt
      };
    }

    if (usage.requestCount >= limit) {
      return {
        allowed: false as const,
        feature: input.feature,
        limit,
        remaining: 0,
        resetAt,
        reason: "daily_limit" as const,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((nextUtcDayStart(now).getTime() - now.getTime()) / 1000)
        )
      };
    }

    const windowAgeMs = now.getTime() - usage.windowStart.getTime();
    const isSameWindow = windowAgeMs < oneMinuteMs;

    if (isSameWindow && usage.windowCount >= burstLimit) {
      return {
        allowed: false as const,
        feature: input.feature,
        limit,
        remaining: Math.max(0, limit - usage.requestCount),
        resetAt,
        reason: "burst_limit" as const,
        retryAfterSeconds: Math.max(1, Math.ceil((oneMinuteMs - windowAgeMs) / 1000))
      };
    }

    const nextWindowStart = isSameWindow ? usage.windowStart : now;
    const nextWindowCount = isSameWindow ? usage.windowCount + 1 : 1;

    const updated = await tx.dailyQuotaUsage.update({
      where: { id: usage.id },
      data: {
        requestCount: { increment: 1 },
        tokenCount: { increment: input.tokenCount ?? 0 },
        windowStart: nextWindowStart,
        windowCount: nextWindowCount
      },
      select: { requestCount: true }
    });

    return {
      allowed: true as const,
      feature: input.feature,
      limit,
      remaining: Math.max(0, limit - updated.requestCount),
      resetAt
    };
  });

  return decision;
}
