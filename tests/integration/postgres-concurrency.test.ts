import { randomUUID } from "node:crypto";

import { QuotaFeature } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const describePostgres =
  process.env.RUN_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("PostgreSQL concurrency controls", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(
    "does not exceed a burst quota under concurrent requests",
    async () => {
      vi.stubEnv("STUDY_DAILY_LIMIT", "100");
      vi.stubEnv("STUDY_BURST_PER_MINUTE", "5");
      vi.resetModules();
      const quota = await import("@/lib/quota");
      const uniqueIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
      const request = new Request("https://example.com/api/study", {
        headers: {
          "x-forwarded-for": uniqueIp,
          "user-agent": `quota-contention-${randomUUID()}`
        }
      });
      const actorKey = quota.__testables.getActorKey({ request });

      const decisions = await Promise.all(
        Array.from({ length: 12 }, () =>
          quota.consumeQuota({
            request,
            feature: QuotaFeature.STUDY
          })
        )
      );

      expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
      expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(7);

      await prisma.dailyQuotaUsage.deleteMany({ where: { actorKey } });
      vi.unstubAllEnvs();
    },
    30_000
  );

  it(
    "atomically caps concurrent registration attempts",
    async () => {
      vi.stubEnv("REGISTRATIONS_PER_HOUR", "4");
      vi.stubEnv("REGISTRATION_ACCOUNT_ATTEMPTS_PER_HOUR", "100");
      const limiter = await import("@/lib/auth-rate-limit");
      const actorIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
      const request = new Request("https://example.com/api/register", {
        headers: { "x-forwarded-for": actorIp }
      });
      const emails = Array.from(
        { length: 10 },
        (_, index) => `concurrency-${randomUUID()}-${index}@example.com`
      );

      const decisions = await Promise.all(
        emails.map((normalizedEmail) =>
          limiter.consumeRegistrationRateLimit({ request, normalizedEmail })
        )
      );

      expect(decisions.filter((decision) => decision.allowed)).toHaveLength(4);
      expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(6);

      const keys = emails.flatMap((normalizedEmail) =>
        Object.values(
          limiter.__testables.buildRuleKeys({
            action: "register",
            headers: request.headers,
            normalizedEmail
          })
        )
      );
      await prisma.rateLimitBucket.deleteMany({ where: { key: { in: keys } } });
      vi.unstubAllEnvs();
    },
    30_000
  );

  it("blocks failed login pairs and clears that pair after success", async () => {
    vi.stubEnv("LOGIN_FAILURES_PER_15_MINUTES", "100");
    vi.stubEnv("LOGIN_ACCOUNT_FAILURES_PER_15_MINUTES", "2");
    const limiter = await import("@/lib/auth-rate-limit");
    const headers = new Headers({
      "x-forwarded-for": `192.0.2.${Math.floor(Math.random() * 200) + 1}`
    });
    const normalizedEmail = `login-${randomUUID()}@example.com`;

    expect(
      await limiter.checkLoginRateLimit({ headers, normalizedEmail })
    ).toEqual({ allowed: true });
    await limiter.recordLoginFailure({ headers, normalizedEmail });
    await limiter.recordLoginFailure({ headers, normalizedEmail });

    await expect(
      limiter.checkLoginRateLimit({ headers, normalizedEmail })
    ).resolves.toMatchObject({
      allowed: false,
      scope: "actor_account"
    });

    await limiter.clearLoginAccountFailures({ headers, normalizedEmail });
    await expect(
      limiter.checkLoginRateLimit({ headers, normalizedEmail })
    ).resolves.toEqual({ allowed: true });

    const keys = Object.values(
      limiter.__testables.buildRuleKeys({
        action: "login",
        headers,
        normalizedEmail
      })
    );
    await prisma.rateLimitBucket.deleteMany({ where: { key: { in: keys } } });
    vi.unstubAllEnvs();
  });
});
