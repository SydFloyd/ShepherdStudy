import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import AdmZip from "adm-zip";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROJECT_ROOT = process.cwd();
const DOWNLOAD_DIR = path.join(PROJECT_ROOT, "data", "downloads");
const SOURCE_DIR = path.join(PROJECT_ROOT, "data", "sources");

const SOURCES = [
  {
    translation: "web",
    zipUrl: "https://ebible.org/Scriptures/eng-web_vpl.zip",
    zipName: "eng-web_vpl.zip",
    vplFileName: "eng-web_vpl.txt"
  },
  {
    translation: "kjv",
    zipUrl: "https://ebible.org/Scriptures/eng-kjv_vpl.zip",
    zipName: "eng-kjv_vpl.zip",
    vplFileName: "eng-kjv_vpl.txt"
  },
  {
    translation: "asv",
    zipUrl: "https://ebible.org/Scriptures/eng-asv_vpl.zip",
    zipName: "eng-asv_vpl.zip",
    vplFileName: "eng-asv_vpl.txt"
  }
];

const BOOKS = [
  ["GEN", "Genesis"],
  ["EXO", "Exodus"],
  ["LEV", "Leviticus"],
  ["NUM", "Numbers"],
  ["DEU", "Deuteronomy"],
  ["JOS", "Joshua"],
  ["JDG", "Judges"],
  ["RUT", "Ruth"],
  ["1SA", "1 Samuel"],
  ["2SA", "2 Samuel"],
  ["1KI", "1 Kings"],
  ["2KI", "2 Kings"],
  ["1CH", "1 Chronicles"],
  ["2CH", "2 Chronicles"],
  ["EZR", "Ezra"],
  ["NEH", "Nehemiah"],
  ["EST", "Esther"],
  ["JOB", "Job"],
  ["PSA", "Psalms"],
  ["PRO", "Proverbs"],
  ["ECC", "Ecclesiastes"],
  ["SOL", "Song of Solomon"],
  ["ISA", "Isaiah"],
  ["JER", "Jeremiah"],
  ["LAM", "Lamentations"],
  ["EZE", "Ezekiel"],
  ["DAN", "Daniel"],
  ["HOS", "Hosea"],
  ["JOE", "Joel"],
  ["AMO", "Amos"],
  ["OBA", "Obadiah"],
  ["JON", "Jonah"],
  ["MIC", "Micah"],
  ["NAH", "Nahum"],
  ["HAB", "Habakkuk"],
  ["ZEP", "Zephaniah"],
  ["HAG", "Haggai"],
  ["ZEC", "Zechariah"],
  ["MAL", "Malachi"],
  ["MAT", "Matthew"],
  ["MAR", "Mark"],
  ["LUK", "Luke"],
  ["JOH", "John"],
  ["ACT", "Acts"],
  ["ROM", "Romans"],
  ["1CO", "1 Corinthians"],
  ["2CO", "2 Corinthians"],
  ["GAL", "Galatians"],
  ["EPH", "Ephesians"],
  ["PHI", "Philippians"],
  ["COL", "Colossians"],
  ["1TH", "1 Thessalonians"],
  ["2TH", "2 Thessalonians"],
  ["1TI", "1 Timothy"],
  ["2TI", "2 Timothy"],
  ["TIT", "Titus"],
  ["PHM", "Philemon"],
  ["HEB", "Hebrews"],
  ["JAM", "James"],
  ["1PE", "1 Peter"],
  ["2PE", "2 Peter"],
  ["1JO", "1 John"],
  ["2JO", "2 John"],
  ["3JO", "3 John"],
  ["JUD", "Jude"],
  ["REV", "Revelation"]
];

const BOOK_BY_CODE = Object.fromEntries(BOOKS);
const BOOK_ORDER_BY_CODE = Object.fromEntries(
  BOOKS.map(([code], index) => [code, index + 1])
);

async function ensureDirectories() {
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  await mkdir(SOURCE_DIR, { recursive: true });
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed download ${url}: HTTP ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(outputPath, buffer);
}

async function extractZip(zipPath, destinationPath) {
  await mkdir(destinationPath, { recursive: true });
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destinationPath, true);
}

function parseVpl(content, translation) {
  const rows = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const match = /^([1-3]?[A-Z]{2,3})\s+(\d+):(\d+)\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const bookCode = match[1];
    const book = BOOK_BY_CODE[bookCode];
    const bookOrder = BOOK_ORDER_BY_CODE[bookCode];
    const chapter = Number(match[2]);
    const verse = Number(match[3]);
    const text = match[4].trim();

    if (!book || !bookOrder || !Number.isInteger(chapter) || !Number.isInteger(verse)) {
      continue;
    }

    rows.push({
      translation,
      bookCode,
      book,
      bookOrder,
      chapter,
      verse,
      text
    });
  }

  return rows;
}

async function importTranslation(source) {
  const zipPath = path.join(DOWNLOAD_DIR, source.zipName);
  const extractedPath = path.join(SOURCE_DIR, source.translation);
  const vplPath = path.join(extractedPath, source.vplFileName);

  console.log(`Downloading ${source.translation}...`);
  await downloadFile(source.zipUrl, zipPath);
  await extractZip(zipPath, extractedPath);

  const rawText = await readFile(vplPath, "utf8");
  const rows = parseVpl(rawText.replace(/^\uFEFF/, ""), source.translation);

  console.log(`Importing ${source.translation}: ${rows.length} verses`);
  await prisma.bibleVerse.deleteMany({
    where: { translation: source.translation }
  });

  const chunkSize = 2000;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    await prisma.bibleVerse.createMany({ data: chunk });
  }
}

async function main() {
  await ensureDirectories();
  for (const source of SOURCES) {
    await importTranslation(source);
  }
  console.log("Bible import complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
