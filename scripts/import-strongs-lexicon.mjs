import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCES = [
  {
    language: "hebrew",
    source: "openscriptures-strongs-hebrew",
    url: "https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/strongs-hebrew-dictionary.js",
    variable: "strongsHebrewDictionary"
  },
  {
    language: "greek",
    source: "openscriptures-strongs-greek",
    url: "https://raw.githubusercontent.com/openscriptures/strongs/master/greek/strongs-greek-dictionary.js",
    variable: "strongsGreekDictionary"
  }
];

function parseDictionaryScript(input, variableName) {
  const pattern = new RegExp(
    `var\\s+${variableName}\\s*=\\s*(\\{[\\s\\S]*?\\})\\s*;\\s*module\\.exports`,
    "m"
  );
  const match = input.match(pattern);
  if (!match?.[1]) {
    throw new Error(`Failed to parse dictionary payload for ${variableName}`);
  }
  return JSON.parse(match[1]);
}

function toRows(entries, source) {
  const rows = [];
  for (const [strong, payload] of Object.entries(entries)) {
    if (!strong || typeof payload !== "object" || payload === null) {
      continue;
    }
    const item = payload;
    rows.push({
      strong,
      language: source.language,
      lemma: String(item.lemma ?? "").trim(),
      translit: item.xlit ? String(item.xlit).trim() : null,
      pronunciation: item.pron ? String(item.pron).trim() : null,
      derivation: item.derivation ? String(item.derivation).trim() : null,
      strongsDef: item.strongs_def ? String(item.strongs_def).trim() : null,
      kjvDef: item.kjv_def ? String(item.kjv_def).trim() : null,
      source: source.source
    });
  }
  return rows.filter((row) => row.lemma.length > 0);
}

async function importSource(source) {
  const response = await fetch(source.url);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${source.language} Strong's dictionary: HTTP ${response.status}`
    );
  }

  const raw = await response.text();
  const parsed = parseDictionaryScript(raw, source.variable);
  const rows = toRows(parsed, source);

  await prisma.bibleLexicon.deleteMany({
    where: { source: source.source }
  });

  const chunkSize = 2000;
  for (let index = 0; index < rows.length; index += chunkSize) {
    await prisma.bibleLexicon.createMany({
      data: rows.slice(index, index + chunkSize)
    });
  }

  console.log(
    `Imported ${rows.length} ${source.language} lexicon rows from ${source.source}`
  );
}

async function main() {
  for (const source of SOURCES) {
    await importSource(source);
  }
  console.log("Strong's lexicon import complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
