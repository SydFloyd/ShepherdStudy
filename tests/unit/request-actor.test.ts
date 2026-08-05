import { getPseudonymousRequestActor } from "@/lib/request-actor";

const PROXY_SECRET = "cloudflare-proxy-test-secret-32-characters";

beforeEach(() => {
  vi.stubEnv("RATE_LIMIT_SECRET", "request-actor-test-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("pseudonymous request actor trust order", () => {
  it("prefers Vercel's authenticated client IP over an unverified Cloudflare header", () => {
    const first = getPseudonymousRequestActor({
      "x-vercel-forwarded-for": "203.0.113.10",
      "cf-connecting-ip": "198.51.100.20"
    });
    const spoofed = getPseudonymousRequestActor({
      "x-vercel-forwarded-for": "203.0.113.10",
      "cf-connecting-ip": "198.51.100.99"
    });

    expect(spoofed).toBe(first);
  });

  it("uses Cloudflare's client IP only when the proxy proves the configured shared secret", () => {
    vi.stubEnv("CLOUDFLARE_PROXY_SECRET", PROXY_SECRET);
    const first = getPseudonymousRequestActor({
      "x-vercel-forwarded-for": "192.0.2.10",
      "cf-connecting-ip": "203.0.113.40",
      "x-shepherdstudy-cloudflare-proxy-secret": PROXY_SECRET
    });
    const sameClientViaAnotherProxy = getPseudonymousRequestActor({
      "x-vercel-forwarded-for": "192.0.2.11",
      "cf-connecting-ip": "203.0.113.40",
      "x-shepherdstudy-cloudflare-proxy-secret": PROXY_SECRET
    });

    expect(sameClientViaAnotherProxy).toBe(first);
  });

  it("falls back to Vercel when the Cloudflare proxy secret is missing or wrong", () => {
    vi.stubEnv("CLOUDFLARE_PROXY_SECRET", PROXY_SECRET);
    const baseline = getPseudonymousRequestActor({
      "x-vercel-forwarded-for": "203.0.113.50"
    });
    const unverified = getPseudonymousRequestActor({
      "x-vercel-forwarded-for": "203.0.113.50",
      "cf-connecting-ip": "198.51.100.60",
      "x-shepherdstudy-cloudflare-proxy-secret": "wrong-secret"
    });

    expect(unverified).toBe(baseline);
  });

  it("retains the non-Vercel forwarded-IP fallback", () => {
    const first = getPseudonymousRequestActor({
      "x-forwarded-for": "203.0.113.70, 10.0.0.2"
    });
    const same = getPseudonymousRequestActor({
      "x-real-ip": "203.0.113.70"
    });

    expect(same).toBe(first);
  });
});
