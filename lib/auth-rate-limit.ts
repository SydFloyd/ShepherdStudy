import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getPseudonymousRequestActor,
  pseudonymousDigest,
  RequestHeaderSource
} from "@/lib/request-actor";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const ACCOUNT_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const PASSWORD_RESET_CONFIRM_WINDOW_MS = 15 * 60 * 1000;
const DONATION_CHECKOUT_WINDOW_MS = 15 * 60 * 1000;
const MEMORIZATION_RECOMMENDATION_WINDOW_MS = 60 * 60 * 1000;
const MEMORIZATION_RECOMMENDATION_DAY_MS = 24 * 60 * 60 * 1000;
const MEMORIZATION_ATTEMPT_WINDOW_MS = 60 * 60 * 1000;
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
  action:
    | "login"
    | "register"
    | "verify_email"
    | "reset_password"
    | "reset_confirm"
    | "donation_checkout"
    | "memorization_recommendation"
    | "memorization_attempt";
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

function getDonationCheckoutRules(input: {
  headers: RequestHeaderSource;
}): RateLimitRule[] {
  const keys = buildRuleKeys({
    action: "donation_checkout",
    headers: input.headers,
    normalizedEmail: "donation"
  });
  return [
    {
      key: keys.actor,
      limit: readPositiveInteger(
        process.env.DONATION_CHECKOUTS_PER_15_MINUTES,
        10,
        1_000
      ),
      windowMs: DONATION_CHECKOUT_WINDOW_MS,
      scope: "actor"
    }
  ];
}

function getMemorizationRecommendationRules(input: {
  headers: RequestHeaderSource;
  userId: string;
}): RateLimitRule[] {
  const keys = buildRuleKeys({
    action: "memorization_recommendation",
    headers: input.headers,
    normalizedEmail: input.userId
  });
  return [
    {
      key: `${keys.actorAccount}:hour`,
      limit: readPositiveInteger(
        process.env.MEMORIZATION_RECOMMENDATIONS_PER_HOUR,
        3,
        100
      ),
      windowMs: MEMORIZATION_RECOMMENDATION_WINDOW_MS,
      scope: "actor_account"
    },
    {
      key: `${keys.actorAccount}:day`,
      limit: readPositiveInteger(
        process.env.MEMORIZATION_RECOMMENDATIONS_PER_DAY,
        10,
        1_000
      ),
      windowMs: MEMORIZATION_RECOMMENDATION_DAY_MS,
      scope: "actor_account"
    }
  ];
}

function getMemorizationAttemptRules(input: {
  headers: RequestHeaderSource;
  userId: string;
}): RateLimitRule[] {
  const keys = buildRuleKeys({
    action: "memorization_attempt",
    headers: input.headers,
    normalizedEmail: input.userId
  });
  return [
    {
      key: keys.actorAccount,
      limit: readPositiveInteger(
        process.env.MEMORIZATION_ATTEMPTS_PER_HOUR,
        300,
        10_000
      ),
      windowMs: MEMORIZATION_ATTEMPT_WINDOW_MS,
      scope: "actor_account"
    }
  ];
}

function getPasswordResetConfirmationRules(input: {
  headers: RequestHeaderSource;
  token: string;
}): RateLimitRule[] {
  const keys = buildRuleKeys({
    action: "reset_confirm",
    headers: input.headers,
    normalizedEmail: input.token
  });
  return [
    {
      key: keys.actor,
      limit: readPositiveInteger(
        process.env.PASSWORD_RESET_CONFIRMATIONS_PER_15_MINUTES,
        20,
        1_000
      ),
      windowMs: PASSWORD_RESET_CONFIRM_WINDOW_MS,
      scope: "actor"
    },
    {
      key: keys.actorAccount,
      limit: readPositiveInteger(
        process.env.PASSWORD_RESET_TOKEN_ATTEMPTS_PER_15_MINUTES,
        5,
        1_000
      ),
      windowMs: PASSWORD_RESET_CONFIRM_WINDOW_MS,
      scope: "actor_account"
    }
  ];
}

function getAccountEmailRules(input: {
  action: "verify_email" | "reset_password";
  headers: RequestHeaderSource;
  normalizedEmail: string;
}): RateLimitRule[] {
  const keys = buildRuleKeys(input);
  return [
    {
      key: keys.actor,
      limit: readPositiveInteger(
        process.env.ACCOUNT_EMAILS_PER_HOUR,
        8,
        1_000
      ),
      windowMs: ACCOUNT_EMAIL_WINDOW_MS,
      scope: "actor"
    },
    {
      key: keys.actorAccount,
      limit: readPositiveInteger(
        process.env.ACCOUNT_EMAIL_ATTEMPTS_PER_HOUR,
        4,
        1_000
      ),
      windowMs: ACCOUNT_EMAIL_WINDOW_MS,
      scope: "actor_account"
    }
  ];
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

export function consumeAccountEmailRateLimit(input: {
  request: Request;
  normalizedEmail: string;
  action: "verify_email" | "reset_password";
}) {
  return consumeRules(
    getAccountEmailRules({
      action: input.action,
      headers: input.request.headers,
      normalizedEmail: input.normalizedEmail
    })
  );
}

export function consumePasswordResetConfirmationRateLimit(input: {
  request: Request;
  token: string;
}) {
  return consumeRules(
    getPasswordResetConfirmationRules({
      headers: input.request.headers,
      token: input.token
    })
  );
}

export function consumeDonationCheckoutRateLimit(input: { request: Request }) {
  return consumeRules(
    getDonationCheckoutRules({ headers: input.request.headers })
  );
}

export function consumeMemorizationRecommendationRateLimit(input: {
  request: Request;
  userId: string;
}) {
  return consumeRules(
    getMemorizationRecommendationRules({
      headers: input.request.headers,
      userId: input.userId
    })
  );
}

export function consumeMemorizationAttemptRateLimit(input: {
  request: Request;
  userId: string;
}) {
  return consumeRules(
    getMemorizationAttemptRules({
      headers: input.request.headers,
      userId: input.userId
    })
  );
}

export const __testables = {
  buildRuleKeys,
  getDonationCheckoutRules,
  getMemorizationRecommendationRules,
  getMemorizationAttemptRules,
  readPositiveInteger
};
