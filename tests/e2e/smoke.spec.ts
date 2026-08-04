import { expect, test } from "@playwright/test";

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
