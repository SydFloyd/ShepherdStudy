import { __testables } from "@/lib/account-email";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("account email links", () => {
  it("builds canonical HTTPS links and escapes email HTML", () => {
    vi.stubEnv("ACCOUNT_EMAIL_BASE_URL", "https://study.example.com/some-path");

    expect(__testables.accountLink("/reset-password", "safe_token")).toBe(
      "https://study.example.com/reset-password?token=safe_token"
    );
    expect(__testables.escapeHtml('<script>"&</script>')).toBe(
      "&lt;script&gt;&quot;&amp;&lt;/script&gt;"
    );
  });

  it("rejects insecure non-local email origins", () => {
    vi.stubEnv("ACCOUNT_EMAIL_BASE_URL", "http://study.example.com");
    expect(() => __testables.publicOrigin()).toThrow(/HTTPS/);
  });

  it("allows local HTTP development origins", () => {
    vi.stubEnv("ACCOUNT_EMAIL_BASE_URL", "http://localhost:3000");
    expect(__testables.publicOrigin()).toBe("http://localhost:3000");
  });
});
