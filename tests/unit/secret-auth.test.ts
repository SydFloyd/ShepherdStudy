import { getBearerToken, safeEqualSecret } from "@/lib/secret-auth";

describe("secret-backed request authorization", () => {
  it("compares candidate secrets without length-dependent equality", () => {
    expect(safeEqualSecret("matching-secret", "matching-secret")).toBe(true);
    expect(safeEqualSecret("short", "a-different-long-secret")).toBe(false);
  });

  it("extracts bearer credentials only", () => {
    expect(
      getBearerToken(
        new Request("https://example.com", {
          headers: { authorization: "Bearer cron-secret" }
        })
      )
    ).toBe("cron-secret");
    expect(
      getBearerToken(
        new Request("https://example.com", {
          headers: { authorization: "Basic not-accepted" }
        })
      )
    ).toBeNull();
  });
});
