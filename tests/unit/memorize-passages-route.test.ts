const routeMocks = vi.hoisted(() => ({
  consumeDbsReadRateLimit: vi.fn(),
  countPassages: vi.fn(),
  createPassage: vi.fn(),
  getServerSession: vi.fn(),
  resolveMemorizationPassage: vi.fn(),
  serializePassage: vi.fn()
}));

vi.mock("next-auth", () => ({
  getServerSession: routeMocks.getServerSession
}));

vi.mock("@/lib/auth", () => ({ authOptions: {} }));

vi.mock("@/lib/auth-rate-limit", () => ({
  consumeDbsReadRateLimit: routeMocks.consumeDbsReadRateLimit
}));

vi.mock("@/lib/dbs-bible", () => ({
  DbsBibleError: class MockDbsBibleError extends Error {}
}));

vi.mock("@/lib/logger", () => ({
  getRequestMeta: vi.fn(() => ({})),
  logEvent: vi.fn()
}));

vi.mock("@/lib/memorization-data", () => ({
  resolveMemorizationPassage: routeMocks.resolveMemorizationPassage,
  serializeMemorizationPassage: routeMocks.serializePassage
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    memorizationPassage: {
      count: routeMocks.countPassages,
      create: routeMocks.createPassage,
      deleteMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/request-context", () => ({
  getRequestId: vi.fn(async () => "request-id")
}));

vi.mock("@/lib/sentry", () => ({ captureServerException: vi.fn() }));

import { POST } from "@/app/api/memorize/passages/route";

function createRequest(translation: string) {
  return new Request("https://example.com/api/memorize/passages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.25"
    },
    body: JSON.stringify({ reference: "John 3:16", translation })
  });
}

describe("memorization passage DBS rate limiting", () => {
  beforeEach(() => {
    routeMocks.consumeDbsReadRateLimit.mockReset();
    routeMocks.countPassages.mockReset();
    routeMocks.createPassage.mockReset();
    routeMocks.getServerSession.mockReset();
    routeMocks.resolveMemorizationPassage.mockReset();
    routeMocks.serializePassage.mockReset();
    routeMocks.getServerSession.mockResolvedValue({ user: { id: "user-1" } });
    routeMocks.countPassages.mockResolvedValue(0);
    routeMocks.serializePassage.mockImplementation((passage) => passage);
  });

  it("rejects a rate-limited remote passage before resolving Bible text", async () => {
    routeMocks.consumeDbsReadRateLimit.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 42,
      scope: "actor"
    });

    const response = await POST(createRequest("dbs:TESTDBS"));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(routeMocks.consumeDbsReadRateLimit).toHaveBeenCalledOnce();
    expect(routeMocks.resolveMemorizationPassage).not.toHaveBeenCalled();
  });

  it("does not consume the DBS limiter for a local translation", async () => {
    routeMocks.resolveMemorizationPassage.mockResolvedValue({
      ok: false,
      message: "Passage not found."
    });

    const response = await POST(createRequest("web"));

    expect(response.status).toBe(400);
    expect(routeMocks.consumeDbsReadRateLimit).not.toHaveBeenCalled();
    expect(routeMocks.resolveMemorizationPassage).toHaveBeenCalledWith({
      reference: "John 3:16",
      translation: "web"
    });
  });

  it("returns a temporary passage without writing a guest database row", async () => {
    routeMocks.getServerSession.mockResolvedValue(null);
    routeMocks.resolveMemorizationPassage.mockResolvedValue({
      ok: true,
      passage: {
        translation: "web",
        reference: "John 3:16",
        book: "John",
        bookOrder: 43,
        chapter: 3,
        verseStart: 16,
        verseEnd: 16,
        isWholeChapter: false,
        text: "For God so loved the world.",
        verses: [{ verse: 16, text: "For God so loved the world." }],
        editionSnapshot: {
          provider: "local"
        }
      }
    });

    const response = await POST(createRequest("web"));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.temporary).toBe(true);
    expect(payload.passage.id).toMatch(/^guest-/);
    expect(payload.passage.reference).toBe("John 3:16");
    expect(routeMocks.countPassages).not.toHaveBeenCalled();
    expect(routeMocks.createPassage).not.toHaveBeenCalled();
  });
});
