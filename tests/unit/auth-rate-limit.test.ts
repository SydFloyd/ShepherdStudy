import { __testables } from "@/lib/auth-rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authentication rate-limit helpers", () => {
  it("builds stable pseudonymous keys without retaining IP or email", () => {
    vi.stubEnv("RATE_LIMIT_SECRET", "rate-limit-test-secret");
    const input = {
      action: "login" as const,
      headers: {
        "x-forwarded-for": "203.0.113.25, 10.0.0.2",
        "user-agent": "rotatable-agent"
      },
      normalizedEmail: "person@example.com"
    };

    const first = __testables.buildRuleKeys(input);
    const second = __testables.buildRuleKeys({
      ...input,
      headers: {
        "x-forwarded-for": "203.0.113.25",
        "user-agent": "different-agent"
      }
    });

    expect(first).toEqual(second);
    expect(first.actor).toMatch(/^login:actor:[a-f0-9]{32}$/);
    expect(first.actorAccount).toMatch(/^login:pair:[a-f0-9]{32}$/);
    expect(JSON.stringify(first)).not.toContain("203.0.113.25");
    expect(JSON.stringify(first)).not.toContain("person@example.com");
  });

  it("uses safe defaults and clamps extreme limits", () => {
    expect(__testables.readPositiveInteger(undefined, 8, 100)).toBe(8);
    expect(__testables.readPositiveInteger("invalid", 8, 100)).toBe(8);
    expect(__testables.readPositiveInteger("0", 8, 100)).toBe(8);
    expect(__testables.readPositiveInteger("500", 8, 100)).toBe(100);
  });

  it("separates password-reset and verification email buckets", () => {
    vi.stubEnv("RATE_LIMIT_SECRET", "rate-limit-test-secret");
    const common = {
      headers: { "x-forwarded-for": "203.0.113.25" },
      normalizedEmail: "person@example.com"
    };

    const reset = __testables.buildRuleKeys({
      action: "reset_password",
      ...common
    });
    const verification = __testables.buildRuleKeys({
      action: "verify_email",
      ...common
    });

    expect(reset.actor).not.toBe(verification.actor);
    expect(reset.actorAccount).not.toBe(verification.actorAccount);
    expect(JSON.stringify(reset)).not.toContain("person@example.com");
  });

  it("uses one pseudonymous actor bucket for donation checkout creation", () => {
    vi.stubEnv("RATE_LIMIT_SECRET", "rate-limit-test-secret");
    vi.stubEnv("DONATION_CHECKOUTS_PER_15_MINUTES", "12");

    const rules = __testables.getDonationCheckoutRules({
      headers: { "x-forwarded-for": "203.0.113.25" }
    });

    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual(
      expect.objectContaining({ limit: 12, scope: "actor" })
    );
    expect(rules[0].key).toMatch(
      /^donation_checkout:actor:[a-f0-9]{32}$/
    );
    expect(rules[0].key).not.toContain("203.0.113.25");
  });

  it("limits recommendation generation by pseudonymous user pair", () => {
    vi.stubEnv("RATE_LIMIT_SECRET", "rate-limit-test-secret");
    vi.stubEnv("MEMORIZATION_RECOMMENDATIONS_PER_HOUR", "7");

    const rules = __testables.getMemorizationRecommendationRules({
      headers: { "x-forwarded-for": "203.0.113.25" },
      userId: "user-private-id"
    });

    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual(
      expect.objectContaining({ limit: 7, scope: "actor_account" })
    );
    expect(rules[0].key).toMatch(
      /^memorization_recommendation:pair:[a-f0-9]{32}:hour$/
    );
    expect(rules[1].key).toMatch(
      /^memorization_recommendation:pair:[a-f0-9]{32}:day$/
    );
    expect(rules[0].key).not.toContain("user-private-id");
  });

  it("allows substantial practice while bounding saved attempt writes", () => {
    vi.stubEnv("RATE_LIMIT_SECRET", "rate-limit-test-secret");
    vi.stubEnv("MEMORIZATION_ATTEMPTS_PER_HOUR", "450");

    const rules = __testables.getMemorizationAttemptRules({
      headers: { "x-forwarded-for": "203.0.113.25" },
      userId: "user-private-id"
    });

    expect(rules).toHaveLength(1);
    expect(rules[0]).toEqual(
      expect.objectContaining({ limit: 450, scope: "actor_account" })
    );
    expect(rules[0].key).toMatch(
      /^memorization_attempt:pair:[a-f0-9]{32}$/
    );
  });

  it("bounds public DBS chapter reads by pseudonymous actor", () => {
    vi.stubEnv("RATE_LIMIT_SECRET", "rate-limit-test-secret");
    vi.stubEnv("DBS_READS_PER_10_MINUTES", "75");
    vi.stubEnv("DBS_GLOBAL_READS_PER_10_MINUTES", "2500");

    const rules = __testables.getDbsReadRules({
      headers: { "x-forwarded-for": "203.0.113.25" }
    });

    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual(
      expect.objectContaining({ limit: 75, scope: "actor" })
    );
    expect(rules[0].key).toMatch(/^dbs_read:actor:[a-f0-9]{32}$/);
    expect(rules[1]).toEqual(
      expect.objectContaining({
        key: "dbs_read:global",
        limit: 2500,
        scope: "global"
      })
    );
  });
});
