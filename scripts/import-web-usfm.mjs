import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import AdmZip from "adm-zip";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PROJECT_ROOT = process.cwd();
const DOWNLOAD_DIR = path.join(PROJECT_ROOT, "data", "downloads");
const SOURCE_ROOT = path.join(PROJECT_ROOT, "data", "sources");

const USFM_SOURCES = [
  {
    translation: "web",
    zipUrl: "https://ebible.org/Scriptures/eng-web_usfm.zip",
    zipName: "eng-web_usfm.zip",
    sourceDir: "web-usfm"
  },
  {
    translation: "kjv",
    zipUrl: "https://ebible.org/Scriptures/eng-kjv_usfm.zip",
    zipName: "eng-kjv_usfm.zip",
    sourceDir: "kjv-usfm"
  },
  {
    translation: "asv",
    zipUrl: "https://ebible.org/Scriptures/eng-asv_usfm.zip",
    zipName: "eng-asv_usfm.zip",
    sourceDir: "asv-usfm"
  }
];

const BOOK_CODE_ENTRIES = [
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
  ["SNG", "Song of Solomon"],
  ["ISA", "Isaiah"],
  ["JER", "Jeremiah"],
  ["LAM", "Lamentations"],
  ["EZK", "Ezekiel"],
  ["DAN", "Daniel"],
  ["HOS", "Hosea"],
  ["JOL", "Joel"],
  ["AMO", "Amos"],
  ["OBA", "Obadiah"],
  ["JON", "Jonah"],
  ["MIC", "Micah"],
  ["NAM", "Nahum"],
  ["HAB", "Habakkuk"],
  ["ZEP", "Zephaniah"],
  ["HAG", "Haggai"],
  ["ZEC", "Zechariah"],
  ["MAL", "Malachi"],
  ["MAT", "Matthew"],
  ["MRK", "Mark"],
  ["LUK", "Luke"],
  ["JHN", "John"],
  ["ACT", "Acts"],
  ["ROM", "Romans"],
  ["1CO", "1 Corinthians"],
  ["2CO", "2 Corinthians"],
  ["GAL", "Galatians"],
  ["EPH", "Ephesians"],
  ["PHP", "Philippians"],
  ["COL", "Colossians"],
  ["1TH", "1 Thessalonians"],
  ["2TH", "2 Thessalonians"],
  ["1TI", "1 Timothy"],
  ["2TI", "2 Timothy"],
  ["TIT", "Titus"],
  ["PHM", "Philemon"],
  ["HEB", "Hebrews"],
  ["JAS", "James"],
  ["1PE", "1 Peter"],
  ["2PE", "2 Peter"],
  ["1JN", "1 John"],
  ["2JN", "2 John"],
  ["3JN", "3 John"],
  ["JUD", "Jude"],
  ["REV", "Revelation"],

  // Alternate VPL aliases retained for compatibility.
  ["JOH", "John"],
  ["MAR", "Mark"],
  ["PHI", "Philippians"],
  ["JAM", "James"],
  ["1JO", "1 John"],
  ["2JO", "2 John"],
  ["3JO", "3 John"],
  ["NAH", "Nahum"],
  ["JOE", "Joel"],
  ["EZE", "Ezekiel"],
  ["SOL", "Song of Solomon"]
];

const BOOK_BY_CODE = Object.fromEntries(BOOK_CODE_ENTRIES);
const BOOK_ORDER_BY_CODE = Object.fromEntries(
  BOOK_CODE_ENTRIES.map(([code], index) => [code, index + 1])
);

const PARAGRAPH_MARKERS = new Set([
  "p",
  "m",
  "pi",
  "pi1",
  "pi2",
  "q",
  "q1",
  "q2",
  "q3",
  "q4",
  "li",
  "li1",
  "li2",
  "li3",
  "li4"
]);

function normalizeWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function cleanUsfmText(input) {
  let text = input;

  // Word-level markup: \w word|attr\w* and \+w word|attr\+w*
  text = text.replace(/\\\+?w\s+([^\\|]+?)(?:\|[^\\]*?)?\\\+?w\*/g, "$1");

  // Remove Jesus-word markers and emphasis wrappers while retaining content.
  text = text.replace(/\\wj\*/g, "");
  text = text.replace(/\\wj\b/g, "");

  // Remove remaining generic USFM markers.
  text = text.replace(/\\[a-z0-9+*-]+\b/g, "");

  // Replace nbsp artifacts and trim spaces.
  text = text.replace(/\u00A0/g, " ");
  return normalizeWhitespace(text);
}

function extractNotesFromVerseText(text, kind) {
  const notes = [];
  const pattern = kind === "footnote" ? /\\f\s+([\s\S]*?)\\f\*/g : /\\x\s+([\s\S]*?)\\x\*/g;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const raw = match[1];
    const callerMatch = raw.match(/\\f[qrc]?\s*([^\s\\]+)/);
    const textMatch = raw.match(/\\f?t\s+([\s\S]*)/) || raw.match(/\\x?t\s+([\s\S]*)/);
    const noteText = cleanUsfmText(textMatch ? textMatch[1] : raw);
    if (!noteText) {
      continue;
    }

    notes.push({
      caller: callerMatch?.[1] ?? null,
      text: noteText
    });
  }

  return notes;
}

function stripNotes(text) {
  return text.replace(/\\f\s+[\s\S]*?\\f\*/g, " ").replace(/\\x\s+[\s\S]*?\\x\*/g, " ");
}

async function ensureSourceFiles(source) {
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const sourceDir = path.join(SOURCE_ROOT, source.sourceDir);
  await mkdir(sourceDir, { recursive: true });

  const response = await fetch(source.zipUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${source.translation.toUpperCase()} USFM: HTTP ${response.status}`
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const zipPath = path.join(DOWNLOAD_DIR, source.zipName);
  await writeFile(zipPath, bytes);

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(sourceDir, true);
  return sourceDir;
}

function parseUsfmFile(content, translation) {
  const lines = content.split(/\r?\n/);
  const verses = [];
  const notes = [];

  let bookCode = "";
  let book = "";
  let bookOrder = 0;
  let chapter = 0;
  let paragraph = 0;
  let currentVerse = null;

  function flushCurrentVerse() {
    if (!currentVerse) {
      return;
    }
    const cleaned = cleanUsfmText(stripNotes(currentVerse.rawText));
    if (cleaned) {
      verses.push({
        translation,
        bookCode,
        book,
        bookOrder,
        chapter,
        verse: currentVerse.verse,
        paragraph: currentVerse.paragraph,
        text: cleaned
      });

      const footnotes = extractNotesFromVerseText(currentVerse.rawText, "footnote");
      for (const note of footnotes) {
        notes.push({
          translation,
          bookCode,
          book,
          bookOrder,
          chapter,
          verse: currentVerse.verse,
          kind: "footnote",
          caller: note.caller,
          text: note.text
        });
      }

      const crossrefs = extractNotesFromVerseText(currentVerse.rawText, "crossref");
      for (const note of crossrefs) {
        notes.push({
          translation,
          bookCode,
          book,
          bookOrder,
          chapter,
          verse: currentVerse.verse,
          kind: "crossref",
          caller: note.caller,
          text: note.text
        });
      }
    }

    currentVerse = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (line.startsWith("\\id ")) {
      flushCurrentVerse();
      const code = line.split(/\s+/)[1];
      bookCode = code?.toUpperCase() ?? "";
      book = BOOK_BY_CODE[bookCode] ?? "";
      bookOrder = BOOK_ORDER_BY_CODE[bookCode] ?? 0;
      continue;
    }

    if (!book || !bookOrder) {
      continue;
    }

    if (line.startsWith("\\c ")) {
      flushCurrentVerse();
      const chapterMatch = line.match(/^\\c\s+(\d+)/);
      chapter = chapterMatch ? Number(chapterMatch[1]) : 0;
      paragraph = 0;
      continue;
    }

    if (chapter < 1) {
      continue;
    }

    const markerMatch = line.match(/^\\([a-z0-9+]+)\b\s*(.*)$/i);
    if (markerMatch) {
      const marker = markerMatch[1];
      const remainder = markerMatch[2] ?? "";

      if (PARAGRAPH_MARKERS.has(marker)) {
        paragraph += 1;
        if (currentVerse && remainder) {
          currentVerse.rawText += ` ${remainder}`;
        }
        continue;
      }

      if (marker === "v") {
        flushCurrentVerse();
        const verseMatch = remainder.match(/^(\d+)(?:-\d+)?\s*(.*)$/);
        if (!verseMatch) {
          continue;
        }

        if (paragraph < 1) {
          paragraph = 1;
        }

        currentVerse = {
          verse: Number(verseMatch[1]),
          paragraph,
          rawText: verseMatch[2] ?? ""
        };
        continue;
      }

      if (currentVerse && remainder) {
        currentVerse.rawText += ` ${remainder}`;
      }
      continue;
    }

    if (currentVerse) {
      currentVerse.rawText += ` ${line}`;
    }
  }

  flushCurrentVerse();
  return { verses, notes };
}

async function importTranslationFromUsfm(source) {
  const sourceDir = await ensureSourceFiles(source);

  const files = (await readdir(sourceDir))
    .filter((name) => name.endsWith(".usfm"))
    .sort((a, b) => a.localeCompare(b));

  const allVerses = [];
  const allNotes = [];

  for (const file of files) {
    const fullPath = path.join(sourceDir, file);
    const raw = await readFile(fullPath, "utf8");
    const parsed = parseUsfmFile(raw.replace(/^\uFEFF/, ""), source.translation);
    allVerses.push(...parsed.verses);
    allNotes.push(...parsed.notes);
  }

  console.log(
    `Parsed ${source.translation.toUpperCase()} USFM verses: ${allVerses.length}`
  );
  console.log(
    `Parsed ${source.translation.toUpperCase()} USFM notes: ${allNotes.length}`
  );

  await prisma.bibleFootnote.deleteMany({ where: { translation: source.translation } });
  await prisma.bibleVerse.deleteMany({ where: { translation: source.translation } });

  const chunkSize = 2000;
  for (let index = 0; index < allVerses.length; index += chunkSize) {
    await prisma.bibleVerse.createMany({
      data: allVerses.slice(index, index + chunkSize)
    });
  }

  for (let index = 0; index < allNotes.length; index += chunkSize) {
    await prisma.bibleFootnote.createMany({
      data: allNotes.slice(index, index + chunkSize)
    });
  }

  console.log(`Imported ${source.translation.toUpperCase()} USFM.`);
}

async function main() {
  const requested = process.argv[2];
  const selected = requested
    ? USFM_SOURCES.filter((source) => source.translation === requested)
    : USFM_SOURCES;

  if (selected.length === 0) {
    throw new Error(
      `Unknown translation "${requested}". Use one of: ${USFM_SOURCES.map(
        (s) => s.translation
      ).join(", ")}`
    );
  }

  for (const source of selected) {
    await importTranslationFromUsfm(source);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
