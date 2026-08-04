import { expect, test } from "@playwright/test";

test("security policy and reduced API surface", async ({ request }) => {
  const register = await request.get("/register");
  expect(register.ok()).toBe(true);
  const policy = register.headers()["content-security-policy-report-only"];
  expect(policy).toContain("default-src 'self'");
  expect(policy).toContain("https://challenges.cloudflare.com");
  expect(policy).toContain("report-uri /api/csp-report");

  const report = await request.post("/api/csp-report", {
    headers: { "Content-Type": "application/csp-report" },
    data: {
      "csp-report": {
        "document-uri": "http://127.0.0.1:3000/register?private=value",
        "blocked-uri": "inline",
        "effective-directive": "script-src",
        disposition: "report"
      }
    }
  });
  expect(report.status()).toBe(204);

  const cleanup = await request.get("/api/maintenance/cleanup");
  expect(cleanup.status()).toBe(401);

  const retiredAppend = await request.post(
    "/api/study/threads/retired/messages",
    { data: {} }
  );
  expect(retiredAppend.status()).toBe(404);
});

test("study page smoke flow", async ({ page }) => {
  await page.route("**/api/study", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "prompt_only",
        modeName: "Topical Discovery",
        assistantBehaviorName: "Topical Scout",
        answer: "Sample study answer",
        context: "Sample context",
        relevance: "Sample relevance",
        passage: null,
        recommendations: [
          {
            reference: "Psalm 23:1",
            reason: "Comfort",
            application: "Trust",
            confidence: 0.9
          }
        ],
        saved: false
      })
    });
  });

  await page.goto("/study");
  await page
    .getByPlaceholder("Enter a verse, verses, or question")
    .fill("Where is comfort in scripture?");
  await page.getByRole("button", { name: "Send study request" }).click();

  await expect(page.getByText("Sample study answer")).toBeVisible();
  await expect(page.getByRole("button", { name: "Psalm 23:1" })).toBeVisible();
});
