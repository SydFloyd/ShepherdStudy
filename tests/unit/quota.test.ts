import { __testables } from "@/lib/quota";

describe("quota helpers", () => {
  it("builds user actor key when userId exists", () => {
    const request = new Request("http://localhost:3000", {
      headers: { "x-forwarded-for": "1.2.3.4", "user-agent": "agent" }
    });
    const key = __testables.getActorKey({ userId: "abc123", request });
    expect(key).toBe("user:abc123");
  });

  it("builds anon actor key from first forwarded ip + ua prefix", () => {
    const request = new Request("http://localhost:3000", {
      headers: {
        "x-forwarded-for": "10.0.0.1, 10.0.0.2",
        "user-agent": "Mozilla/TestAgent/VeryLongStringThatWillBeTrimmedAt48Characters"
      }
    });
    const key = __testables.getActorKey({ request });
    expect(key.startsWith("anon:10.0.0.1:Mozilla/TestAgent/")).toBe(true);
  });

  it("calculates UTC day boundaries", () => {
    const date = new Date("2026-02-14T23:59:59.900Z");
    const start = __testables.startOfUtcDay(date);
    const next = __testables.nextUtcDayStart(date);
    expect(start.toISOString()).toBe("2026-02-14T00:00:00.000Z");
    expect(next.toISOString()).toBe("2026-02-15T00:00:00.000Z");
  });
});
