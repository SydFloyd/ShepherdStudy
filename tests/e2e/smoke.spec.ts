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

test("memorization passage recall and progress flow", async ({ page }) => {
  const passage = {
    id: "cmemorizepassage0000000000001",
    translation: "web",
    reference: "Romans 8:1-4",
    book: "Romans",
    bookOrder: 45,
    chapter: 8,
    verseStart: 1,
    verseEnd: 4,
    isWholeChapter: false,
    text: "There is therefore now no condemnation. For the law of the Spirit of life set me free.",
    verses: [
      { verse: 1, text: "There is therefore now no condemnation." },
      { verse: 2, text: "For the law of the Spirit of life set me free." },
      { verse: 3, text: "For what the law could not do, God did." },
      { verse: 4, text: "That the ordinance might be fulfilled." }
    ],
    textAttemptCount: 0,
    latestTextScore: null,
    bestTextScore: null,
    referenceAttemptCount: 0,
    latestReferenceScore: null,
    bestReferenceScore: null,
    lastPracticedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "user-1", email: "person@example.com" }
      })
    });
  });
  await page.route("**/api/memorize", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        preferredTranslation: "web",
        passages: [passage],
        recommendations: null,
        recommendationsStale: false
      })
    });
  });
  await page.route("**/api/memorize/attempts", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        assessment: {
          score: 75,
          matchedWords: 3,
          expectedWordCount: 4,
          submittedWordCount: 3,
          expected: [
            { text: "There", status: "correct" },
            { text: "is", status: "correct" },
            { text: "now", status: "missing" },
            { text: "hope", status: "correct" }
          ],
          submitted: [
            { text: "There", status: "correct" },
            { text: "is", status: "correct" },
            { text: "hope", status: "correct" }
          ]
        },
        passage: {
          ...passage,
          textAttemptCount: 1,
          latestTextScore: 75,
          bestTextScore: 75
        }
      })
    });
  });

  await page.goto("/memorize");
  await expect(page.getByRole("heading", { name: "Write Romans 8:1-4 from memory" })).toBeVisible();
  await page.getByPlaceholder("Type the passage without looking...").fill("There is hope");
  await page.getByRole("button", { name: "Check recall" }).click();

  await expect(page.getByRole("heading", { name: "75% correct" })).toBeVisible();
  await expect(page.locator(".memorizeRecallToken.missing", { hasText: "now" })).toBeVisible();
  await expect(page.getByText("For the law of the Spirit of life set me free.")).toBeVisible();
});
