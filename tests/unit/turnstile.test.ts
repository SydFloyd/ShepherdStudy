import { TURNSTILE_ACTION } from "@/lib/turnstile-config";
import { isTurnstileConfigured, verifyTurnstile } from "@/lib/turnstile";

function configureTurnstile() {
  vi.stubEnv("TURNSTILE_SECRET", "test-secret");
  vi.stubEnv("TURNSTILE_HOSTNAMES", "example.com,www.example.com");
}

function request(headers?: HeadersInit) {
  return new Request("https://example.com/api/register", { headers });
}

function mockSiteverify(result: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(result), {
      status,
      headers: { "Content-Type": "application/json" }
    })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Turnstile verification", () => {
  it("accepts a successful challenge with the expected action and hostname", async () => {
    configureTurnstile();
    const fetchMock = mockSiteverify({
      success: true,
      action: TURNSTILE_ACTION,
      hostname: "EXAMPLE.COM."
    });

    await expect(
      verifyTurnstile(
        request({
          "cf-connecting-ip": "203.0.113.10",
          "x-forwarded-for": "198.51.100.3"
        }),
        "fresh-token"
      )
    ).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = init.body as URLSearchParams;
    expect(body.get("secret")).toBe("test-secret");
    expect(body.get("response")).toBe("fresh-token");
    expect(body.get("remoteip")).toBe("203.0.113.10");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails closed when server configuration is incomplete", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "");
    vi.stubEnv("ACCOUNT_EMAIL_BASE_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      verifyTurnstile(request(), "token")
    ).resolves.toEqual({
      success: false,
      reason: "missing_configuration"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the trusted application URL when the explicit hostname list is absent", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "test-secret");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "");
    vi.stubEnv("NEXTAUTH_URL", "https://example.com/login");
    mockSiteverify({
      success: true,
      action: TURNSTILE_ACTION,
      hostname: "example.com"
    });

    await expect(verifyTurnstile(request(), "token")).resolves.toEqual({
      success: true
    });
    expect(isTurnstileConfigured()).toBe(true);
  });

  it("accepts the common secret-key alias", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "alternate-secret");
    vi.stubEnv("TURNSTILE_HOSTNAMES", "example.com");
    const fetchMock = mockSiteverify({
      success: true,
      action: TURNSTILE_ACTION,
      hostname: "example.com"
    });

    await expect(verifyTurnstile(request(), "token")).resolves.toEqual({
      success: true
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.body as URLSearchParams).get("secret")).toBe(
      "alternate-secret"
    );
  });

  it("rejects empty and oversized tokens before calling Siteverify", async () => {
    configureTurnstile();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyTurnstile(request(), " ")).resolves.toEqual({
      success: false,
      reason: "invalid_token"
    });
    await expect(
      verifyTurnstile(request(), "x".repeat(2049))
    ).resolves.toEqual({
      success: false,
      reason: "invalid_token"
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects failed challenges and mismatched metadata", async () => {
    configureTurnstile();
    mockSiteverify({ success: false });
    await expect(verifyTurnstile(request(), "token")).resolves.toEqual({
      success: false,
      reason: "challenge_rejected"
    });

    mockSiteverify({
      success: true,
      action: "different-action",
      hostname: "example.com"
    });
    await expect(verifyTurnstile(request(), "token")).resolves.toEqual({
      success: false,
      reason: "action_mismatch"
    });

    mockSiteverify({
      success: true,
      action: TURNSTILE_ACTION,
      hostname: "attacker.example"
    });
    await expect(verifyTurnstile(request(), "token")).resolves.toEqual({
      success: false,
      reason: "hostname_mismatch"
    });
  });

  it("fails closed on network, HTTP, and response parsing errors", async () => {
    configureTurnstile();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(verifyTurnstile(request(), "token")).resolves.toEqual({
      success: false,
      reason: "siteverify_unavailable"
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));
    await expect(verifyTurnstile(request(), "token")).resolves.toEqual({
      success: false,
      reason: "siteverify_unavailable"
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json")));
    await expect(verifyTurnstile(request(), "token")).resolves.toEqual({
      success: false,
      reason: "siteverify_unavailable"
    });

    mockSiteverify(null);
    await expect(verifyTurnstile(request(), "token")).resolves.toEqual({
      success: false,
      reason: "siteverify_unavailable"
    });
  });
});
