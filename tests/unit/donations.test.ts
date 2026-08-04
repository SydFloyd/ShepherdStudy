import {
  formatUsdInput,
  getDonationLimits,
  getDonationOrigin,
  parseDonationAmount
} from "@/lib/donations";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("donation amount helpers", () => {
  it("parses exact USD amounts without floating-point rounding", () => {
    const limits = { minimumCents: 300, maximumCents: 50_000 };

    expect(parseDonationAmount("3", limits)).toBe(300);
    expect(parseDonationAmount("3.5", limits)).toBe(350);
    expect(parseDonationAmount("3.05", limits)).toBe(305);
    expect(parseDonationAmount("500.00", limits)).toBe(50_000);
  });

  it("rejects malformed and out-of-range values", () => {
    const limits = { minimumCents: 300, maximumCents: 50_000 };

    for (const value of [
      "",
      "2.99",
      "500.01",
      "3.001",
      "1e2",
      "3,00",
      "-5"
    ]) {
      expect(parseDonationAmount(value, limits)).toBeNull();
    }
  });

  it("uses safe configurable limits", () => {
    vi.stubEnv("DONATION_MIN_USD", "5.25");
    vi.stubEnv("DONATION_MAX_USD", "100.50");
    expect(getDonationLimits()).toEqual({
      minimumCents: 525,
      maximumCents: 10_050
    });
    expect(formatUsdInput(525)).toBe("5.25");
  });

  it("uses only trusted production or local origins", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://shepstudy.com/path");
    expect(getDonationOrigin("https://ignored.example")).toBe(
      "https://shepstudy.com"
    );

    vi.stubEnv("NEXTAUTH_URL", "http://localhost:3000");
    expect(getDonationOrigin()).toBe("http://localhost:3000");

    vi.stubEnv("NEXTAUTH_URL", "http://example.com");
    expect(() => getDonationOrigin()).toThrow("trusted HTTPS origin");
  });
});
