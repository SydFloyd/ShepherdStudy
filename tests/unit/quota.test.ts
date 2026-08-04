import { __testables } from "@/lib/quota";

describe("quota helpers", () => {
  it("builds user actor key when userId exists", () => {
    const request = new Request("http://localhost:3000", {
      headers: { "x-forwarded-for": "1.2.3.4", "user-agent": "agent" }
    });
    const key = __testables.getActorKey({ userId: "abc123", request });
    expect(key).toBe("user:abc123");
  });

  it("builds a stable pseudonymous actor key without retaining IP or user agent", () => {
    const request = new Request("http://localhost:3000", {
      headers: {
        "x-forwarded-for": "10.0.0.1, 10.0.0.2",
        "user-agent": "Mozilla/TestAgent/VeryLongStringThatWillBeTrimmedAt48Characters"
      }
    });
    const key = __testables.getActorKey({ request });
    expect(key).toMatch(/^anon:[a-f0-9]{32}$/);
    expect(key).not.toContain("10.0.0.1");
    expect(key).not.toContain("Mozilla");
  });

  it("falls back for invalid limits and clamps extreme limits", () => {
    expect(__testables.readPositiveInteger("invalid", 40, 100)).toBe(40);
    expect(__testables.readPositiveInteger("0", 40, 100)).toBe(40);
    expect(__testables.readPositiveInteger("500", 40, 100)).toBe(100);
  });

  it("calculates UTC day boundaries", () => {
    const date = new Date("2026-02-14T23:59:59.900Z");
    const start = __testables.startOfUtcDay(date);
    const next = __testables.nextUtcDayStart(date);
    expect(start.toISOString()).toBe("2026-02-14T00:00:00.000Z");
    expect(next.toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });
});
