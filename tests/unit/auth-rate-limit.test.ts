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
});
