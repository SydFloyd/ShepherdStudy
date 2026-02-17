const DEFAULT_BASE_URL =
  process.env.PREWARM_BASE_URL?.trim() || "http://localhost:3000";

const VERSIONS = (process.env.PREWARM_TRANSLATIONS || "web,kjv,asv")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const REFERENCES = [
  "Genesis 1:1",
  "Genesis 1:2",
  "Psalm 23:1",
  "Psalm 23:4",
  "Proverbs 3:5",
  "Isaiah 53:5",
  "Matthew 5:3",
  "Matthew 6:33",
  "John 1:1",
  "John 1:14",
  "John 3:16",
  "John 14:6",
  "Romans 8:28",
  "Romans 12:2",
  "1 Corinthians 13:4",
  "Ephesians 2:8",
  "Philippians 4:6",
  "Hebrews 11:1",
  "James 1:5",
  "1 Peter 5:7"
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { ok: response.ok, status: response.status, body, headers: response.headers };
}

async function warmOne(baseUrl, reference, translation) {
  const payload = { reference, translation };
  const fullUrl = `${baseUrl}/api/word-lens`;
  const mapUrl = `${baseUrl}/api/word-lens/map`;

  const full = await requestJson(fullUrl, payload);
  if (!full.ok) {
    return {
      ok: false,
      stage: "full",
      status: full.status,
      error: full.body?.error ?? "Unknown error"
    };
  }

  const map = await requestJson(mapUrl, payload);
  if (!map.ok) {
    return {
      ok: false,
      stage: "map",
      status: map.status,
      error: map.body?.error ?? "Unknown error"
    };
  }

  return { ok: true };
}

async function main() {
  const baseUrl = DEFAULT_BASE_URL.replace(/\/+$/, "");
  const pairs = [];
  for (const reference of REFERENCES) {
    for (const translation of VERSIONS) {
      pairs.push({ reference, translation });
    }
  }

  console.log(`Prewarm base URL: ${baseUrl}`);
  console.log(`References: ${REFERENCES.length}`);
  console.log(`Translations: ${VERSIONS.join(", ")}`);
  console.log(`Total warm targets: ${pairs.length} (x2 endpoints each)\n`);

  let okCount = 0;
  let failCount = 0;

  for (let index = 0; index < pairs.length; index += 1) {
    const item = pairs[index];
    const label = `[${index + 1}/${pairs.length}] ${item.reference} (${item.translation})`;

    const result = await warmOne(baseUrl, item.reference, item.translation);
    if (result.ok) {
      okCount += 1;
      console.log(`${label} -> OK`);
      await sleep(150);
      continue;
    }

    if (result.status === 429) {
      const waitMs = 1200;
      console.log(`${label} -> RATE LIMITED (${result.stage}), waiting ${waitMs}ms and retrying once`);
      await sleep(waitMs);
      const retry = await warmOne(baseUrl, item.reference, item.translation);
      if (retry.ok) {
        okCount += 1;
        console.log(`${label} -> OK (after retry)`);
        await sleep(150);
        continue;
      }
      failCount += 1;
      console.log(
        `${label} -> FAILED after retry [${retry.stage}] status=${retry.status} error=${retry.error}`
      );
      continue;
    }

    failCount += 1;
    console.log(
      `${label} -> FAILED [${result.stage}] status=${result.status} error=${result.error}`
    );
  }

  console.log("\nPrewarm complete.");
  console.log(`Successful: ${okCount}`);
  console.log(`Failed: ${failCount}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
