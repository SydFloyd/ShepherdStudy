import {
  __testables,
  extractCspViolations
} from "@/lib/csp-report";

describe("CSP report sanitization", () => {
  it("accepts a legacy report while stripping URLs of query and fragment data", () => {
    expect(
      extractCspViolations({
        "csp-report": {
          "document-uri": "https://example.com/register?email=private%40example.com",
          "blocked-uri": "https://evil.example/script.js?token=secret#fragment",
          "effective-directive": "script-src-elem",
          disposition: "report"
        }
      })
    ).toEqual([
      {
        documentPath: "https://example.com/register",
        blockedTarget: "https://evil.example",
        directive: "script-src-elem",
        disposition: "report"
      }
    ]);
  });

  it("accepts Reporting API batches and caps work per request", () => {
    const reports = Array.from({ length: 20 }, () => ({
      body: {
        documentURL: "https://example.com/study",
        blockedURL: "inline",
        effectiveDirective: "script-src",
        disposition: "report"
      }
    }));

    expect(extractCspViolations(reports)).toHaveLength(10);
  });

  it("does not retain data or blob payloads", () => {
    expect(__testables.safeResource("data:text/plain,private")).toBe("data:");
    expect(__testables.safeResource("blob:https://example.com/private-id")).toBe(
      "blob:"
    );
  });
});
