import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getPseudonymousRequestActor,
  pseudonymousDigest,
  RequestHeaderSource
} from "@/lib/request-actor";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const MAX_TRANSACTION_ATTEMPTS = 6;

type RateLimitRule = {
  key: string;
  limit: number;
  windowMs: number;
  scope: "actor" | "actor_account";
};

export type AuthRateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      retryAfterSeconds: number;
      scope: RateLimitRule["scope"];
    };

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number
) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, maximum);
}

function buildRuleKeys(input: {
  action: "login" | "register";
  headers: RequestHeaderSource;
  normalizedEmail: string;
}) {
  const actor = getPseudonymousRequestActor(input.headers, {
    includeUserAgent: false
  });
  const account = pseudonymousDigest(input.normalizedEmail);
  return {
    actor: `${input.action}:actor:${actor}`,
    actorAccount: `${input.action}:pair:${pseudonymousDigest(
      `${actor}|${account}`
    )}`
  };
}

function getLoginRules(input: {
  headers: RequestHeaderSource;
  normalizedEmail: string;
}): RateLimitRule[] {
  const keys = buildRuleKeys({ action: "login", ...input });
  return [
    {
      key: keys.actor,
      limit: readPositiveInteger(
        process.env.LOGIN_FAILURES_PER_15_MINUTES,
        30,
        1_000
      ),
      windowMs: LOGIN_WINDOW_MS,
      scope: "actor"
    },
    {
      key: keys.actorAccount,
      limit: readPositiveInteger(
        process.env.LOGIN_ACCOUNT_FAILURES_PER_15_MINUTES,
        8,
        1_000
      ),
      windowMs: LOGIN_WINDOW_MS,
      scope: "actor_account"
    }
  ];
}

function getRegistrationRules(input: {
  headers: RequestHeaderSource;
  normalizedEmail: string;
}): RateLimitRule[] {
  const keys = buildRuleKeys({ action: "register", ...input });
  return [
    {
      key: keys.actor,
      limit: readPositiveInteger(
        process.env.REGISTRATIONS_PER_HOUR,
        5,
        1_000
      ),
      windowMs: REGISTRATION_WINDOW_MS,
      scope: "actor"
    },
    {
      key: keys.actorAccount,
      limit: readPositiveInteger(
        process.env.REGISTRATION_ACCOUNT_ATTEMPTS_PER_HOUR,
        3,
        1_000
      ),
      windowMs: REGISTRATION_WINDOW_MS,
      scope: "actor_account"
    }
  ];
}

function activeCount(
  record: { count: number; expiresAt: Date } | undefined,
  now: Date
) {
  return record && record.expiresAt.getTime() > now.getTime()
    ? record.count
    : 0;
}

function blockedDecision(
  rules: RateLimitRule[],
  records: Map<string, { count: number; expiresAt: Date }>,
  now: Date
): AuthRateLimitDecision | null {
  for (const rule of rules) {
    const record = records.get(rule.key);
    if (record && activeCount(record, now) >= rule.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1_000)
        ),
        scope: rule.scope
      };
    }
  }
  return null;
}

function isRetryableConflict(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === "P2002" || code === "P2034";
}

async function checkRules(rules: RateLimitRule[]): Promise<AuthRateLimitDecision> {
  const now = new Date();
  const records = await prisma.rateLimitBucket.findMany({
    where: { key: { in: rules.map((rule) => rule.key) } },
    select: { key: true, count: true, expiresAt: true }
  });
  const recordMap = new Map(records.map((record) => [record.key, record]));
  return blockedDecision(rules, recordMap, now) ?? { allowed: true };
}

async function consumeRules(
  rules: RateLimitRule[]
): Promise<AuthRateLimitDecision> {
  async function consumeInTransaction() {
    const now = new Date();
    return prisma.$transaction(
      async (tx) => {
        const records = await tx.rateLimitBucket.findMany({
          where: { key: { in: rules.map((rule) => rule.key) } },
          select: { key: true, count: true, expiresAt: true }
        });
        const recordMap = new Map(
          records.map((record) => [record.key, record])
        );
        const blocked = blockedDecision(rules, recordMap, now);
        if (blocked) {
          return blocked;
        }

        for (const rule of rules) {
          const record = recordMap.get(rule.key);
          if (activeCount(record, now) > 0) {
            await tx.rateLimitBucket.update({
              where: { key: rule.key },
              data: { count: { increment: 1 } }
            });
          } else {
            await tx.rateLimitBucket.upsert({
              where: { key: rule.key },
              create: {
                key: rule.key,
                count: 1,
                windowStart: now,
                expiresAt: new Date(now.getTime() + rule.windowMs)
              },
              update: {
                count: 1,
                windowStart: now,
                expiresAt: new Date(now.getTime() + rule.windowMs)
              }
            });
          }
        }

        return { allowed: true as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await consumeInTransaction();
    } catch (error) {
      if (!isRetryableConflict(error) || attempt === MAX_TRANSACTION_ATTEMPTS - 1) {
        throw error;
      }
    }
  }

  throw new Error("Unable to consume authentication rate limit.");
}

export function checkLoginRateLimit(input: {
  headers: RequestHeaderSource;
  normalizedEmail: string;
}) {
  return checkRules(getLoginRules(input));
}

export function recordLoginFailure(input: {
  headers: RequestHeaderSource;
  normalizedEmail: string;
}) {
  return consumeRules(getLoginRules(input));
}

export async function clearLoginAccountFailures(input: {
  headers: RequestHeaderSource;
  normalizedEmail: string;
}) {
  const rules = getLoginRules(input);
  const pairRule = rules.find((rule) => rule.scope === "actor_account");
  if (pairRule) {
    await prisma.rateLimitBucket.deleteMany({ where: { key: pairRule.key } });
  }
}

export function consumeRegistrationRateLimit(input: {
  request: Request;
  normalizedEmail: string;
}) {
  return consumeRules(
    getRegistrationRules({
      headers: input.request.headers,
      normalizedEmail: input.normalizedEmail
    })
  );
}

export const __testables = {
  buildRuleKeys,
  readPositiveInteger
};
