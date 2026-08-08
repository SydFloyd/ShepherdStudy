import { z } from "zod";

import { consumeEsvApiQuota } from "@/lib/auth-rate-limit";
import {
  BibleVersion,
  ESV_TRANSLATION_ID,
  getBookOrderByName
} from "@/lib/bible";
import { BibleProviderError } from "@/lib/bible-provider-error";
import { prisma } from "@/lib/prisma";

const ESV_API_URL = "https://api.esv.org/v3/passage/text/";
const ESV_TIMEOUT_MS = 8_000;
const ESV_MAX_RESPONSE_BYTES = 250_000;
const ESV_CACHE_TTL_HOURS = 168;
const ESV_CACHE_MAX_VERSES = 450;
const ESV_BOOK_SAFETY_RATIO = 0.45;

export const ESV_VERSION: BibleVersion = {
  value: ESV_TRANSLATION_ID,
  provider: "esv",
  providerId: ESV_TRANSLATION_ID,
  label: "ESV",
  title: "English Standard Version",
  vernacularTitle: "English Standard Version",
  languageName: "English",
  languageIso: "eng",
  script: "Latn",
  direction: "ltr",
  year: 2025,
  copyright:
    "Scripture quotations marked \u201cESV\u201d are from the ESV\u00ae Bible (The Holy Bible, English Standard Version\u00ae), \u00a9 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved. The ESV text may not be quoted in any publication made available to the public by a Creative Commons license. The ESV may not be translated into any other language.",
  originalLanguage: false
};

const esvResponseSchema = z
  .object({
    passages: z.array(z.string().max(200_000)).max(10)
  })
  .passthrough();

type EsvVerse = {
  verse: number;
  paragraph: number;
  text: string;
};

type EsvChapterMetadata = {
  book: string;
  bookOrder: number;
  bookVerseCount: number;
  chapterVerseNumbers: number[];
};

const inFlightRequests = new Map<string, Promise<EsvVerse[]>>();

function readPositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum: number
) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

function getCacheTtlMs() {
  return (
    readPositiveInteger(
      process.env.ESV_CACHE_TTL_HOURS,
      ESV_CACHE_TTL_HOURS,
      24 * 30
    ) *
    60 *
    60 *
    1_000
  );
}

function getCacheMaxVerses() {
  return readPositiveInteger(
    process.env.ESV_CACHE_MAX_VERSES,
    ESV_CACHE_MAX_VERSES,
    ESV_CACHE_MAX_VERSES
  );
}

export function isEsvConfigured() {
  return Boolean(process.env.ESV_API_KEY?.trim());
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.ceil(seconds);
  }
  const retryDate = Date.parse(value);
  if (!Number.isNaN(retryDate)) {
    return Math.max(1, Math.ceil((retryDate - Date.now()) / 1_000));
  }
  return undefined;
}

export function parseEsvPassageText(text: string): EsvVerse[] {
  const markers = Array.from(text.matchAll(/\[(\d+)\]\s*/g));
  return markers
    .map((marker, index) => {
      const verse = Number(marker[1]);
      const start = (marker.index ?? 0) + marker[0].length;
      const end = markers[index + 1]?.index ?? text.length;
      const verseText = text.slice(start, end).replace(/\s+/g, " ").trim();
      return { verse, paragraph: 1, text: verseText };
    })
    .filter(
      (verse) =>
        Number.isSafeInteger(verse.verse) &&
        verse.verse > 0 &&
        verse.text.length > 0
    );
}

async function getChapterMetadata(input: {
  book: string;
  chapter: number;
}): Promise<EsvChapterMetadata | null> {
  const bookOrder = getBookOrderByName(input.book);
  if (!bookOrder) {
    return null;
  }

  const [bookVerseCount, chapterRows] = await Promise.all([
    prisma.bibleVerse.count({
      where: { translation: "web", bookOrder }
    }),
    prisma.bibleVerse.findMany({
      where: {
        translation: "web",
        bookOrder,
        chapter: input.chapter
      },
      orderBy: { verse: "asc" },
      select: { book: true, verse: true }
    })
  ]);
  if (bookVerseCount === 0 || chapterRows.length === 0) {
    return null;
  }
  return {
    book: chapterRows[0].book,
    bookOrder,
    bookVerseCount,
    chapterVerseNumbers: chapterRows.map((row) => row.verse)
  };
}

function buildQueryReference(input: {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}) {
  const verses =
    input.verseStart === input.verseEnd
      ? `${input.verseStart}`
      : `${input.verseStart}-${input.verseEnd}`;
  return `${input.book} ${input.chapter}:${verses}`;
}

async function fetchEsvSegment(input: {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}): Promise<EsvVerse[]> {
  const reference = buildQueryReference(input);
  const existing = inFlightRequests.get(reference);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    const apiKey = process.env.ESV_API_KEY?.trim();
    if (!apiKey) {
      throw new BibleProviderError(
        "ESV_API_KEY is not configured.",
        "esv",
        "not_configured"
      );
    }
    const quota = await consumeEsvApiQuota();
    if (!quota.allowed) {
      throw new BibleProviderError(
        "The local ESV API request budget is exhausted.",
        "esv",
        "quota_exhausted",
        429,
        quota.retryAfterSeconds
      );
    }

    const url = new URL(ESV_API_URL);
    url.searchParams.set("q", reference);
    url.searchParams.set("include-passage-references", "false");
    url.searchParams.set("include-verse-numbers", "true");
    url.searchParams.set("include-first-verse-numbers", "true");
    url.searchParams.set("include-footnotes", "false");
    url.searchParams.set("include-footnote-body", "false");
    url.searchParams.set("include-headings", "false");
    url.searchParams.set("include-short-copyright", "false");
    url.searchParams.set("include-copyright", "false");
    url.searchParams.set("include-passage-horizontal-lines", "false");
    url.searchParams.set("include-heading-horizontal-lines", "false");
    url.searchParams.set("indent-poetry", "false");
    url.searchParams.set("indent-paragraphs", "0");
    url.searchParams.set("line-length", "0");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ESV_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Token ${apiKey}`,
          "User-Agent":
            "ShepherdStudy/1.0 (Scripture access; +https://shepstudy.com/info; contact@shepstudy.com)"
        },
        signal: controller.signal,
        cache: "no-store"
      });
    } catch (error) {
      throw new BibleProviderError(
        error instanceof Error ? error.message : "ESV request failed.",
        "esv",
        "unavailable"
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      throw new BibleProviderError(
        "The ESV API request allowance is exhausted.",
        "esv",
        "quota_exhausted",
        429,
        parseRetryAfter(response.headers.get("Retry-After"))
      );
    }
    if (response.status === 404) {
      throw new BibleProviderError(
        "The ESV passage was not found.",
        "esv",
        "not_found",
        404
      );
    }
    if (!response.ok) {
      throw new BibleProviderError(
        `The ESV API returned status ${response.status}.`,
        "esv",
        "unavailable",
        response.status,
        parseRetryAfter(response.headers.get("Retry-After"))
      );
    }

    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > ESV_MAX_RESPONSE_BYTES) {
      throw new BibleProviderError(
        "The ESV API response was unexpectedly large.",
        "esv",
        "invalid_response"
      );
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(body);
    } catch {
      throw new BibleProviderError(
        "The ESV API response was not valid JSON.",
        "esv",
        "invalid_response"
      );
    }
    const parsed = esvResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
      throw new BibleProviderError(
        "The ESV API response did not match the expected format.",
        "esv",
        "invalid_response"
      );
    }
    const parsedVerses = parsed.data.passages.flatMap(parseEsvPassageText);
    if (
      parsedVerses.some(
        (verse, index) =>
          verse.verse < input.verseStart ||
          verse.verse > input.verseEnd ||
          (index > 0 && parsedVerses[index - 1].verse >= verse.verse)
      )
    ) {
      throw new BibleProviderError(
        "The ESV API returned an incomplete passage.",
        "esv",
        "invalid_response"
      );
    }
    const parsedByVerse = new Map(
      parsedVerses.map((verse) => [verse.verse, verse])
    );
    return Array.from(
      { length: input.verseEnd - input.verseStart + 1 },
      (_, index) => {
        const verse = input.verseStart + index;
        return parsedByVerse.get(verse) ?? { verse, paragraph: 1, text: "" };
      }
    );
  })();

  inFlightRequests.set(reference, request);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(reference);
  }
}

function contiguousRanges(verseNumbers: number[], maximumSize: number) {
  const ranges: Array<{ verseStart: number; verseEnd: number }> = [];
  let index = 0;
  while (index < verseNumbers.length) {
    const start = verseNumbers[index];
    let end = start;
    let count = 1;
    while (
      index + count < verseNumbers.length &&
      verseNumbers[index + count] === end + 1 &&
      count < maximumSize
    ) {
      end = verseNumbers[index + count];
      count += 1;
    }
    ranges.push({ verseStart: start, verseEnd: end });
    index += count;
  }
  return ranges;
}

async function cacheFetchedVerses(input: {
  metadata: EsvChapterMetadata;
  chapter: number;
  verses: EsvVerse[];
}) {
  if (input.verses.length === 0) {
    return;
  }
  const maximumForBook = Math.floor(
    input.metadata.bookVerseCount * ESV_BOOK_SAFETY_RATIO
  );
  const versesToStore = input.verses.slice(
    0,
    Math.min(maximumForBook, getCacheMaxVerses())
  );
  if (versesToStore.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(8220047001)::text AS "lock"
    `;
    const now = new Date();
    await tx.esvVerseCache.deleteMany({ where: { expiresAt: { lte: now } } });

    await tx.esvVerseCache.deleteMany({
      where: {
        bookOrder: input.metadata.bookOrder,
        chapter: input.chapter,
        verse: { in: versesToStore.map((verse) => verse.verse) }
      }
    });

    const sameBookCount = await tx.esvVerseCache.count({
      where: { bookOrder: input.metadata.bookOrder }
    });
    const sameBookExcess = Math.max(
      0,
      sameBookCount + versesToStore.length - maximumForBook
    );
    if (sameBookExcess > 0) {
      const oldest = await tx.esvVerseCache.findMany({
        where: { bookOrder: input.metadata.bookOrder },
        orderBy: { lastAccessedAt: "asc" },
        take: sameBookExcess,
        select: { id: true }
      });
      await tx.esvVerseCache.deleteMany({
        where: { id: { in: oldest.map((row) => row.id) } }
      });
    }

    const globalCount = await tx.esvVerseCache.count();
    const globalExcess = Math.max(
      0,
      globalCount + versesToStore.length - getCacheMaxVerses()
    );
    if (globalExcess > 0) {
      const oldest = await tx.esvVerseCache.findMany({
        orderBy: { lastAccessedAt: "asc" },
        take: globalExcess,
        select: { id: true }
      });
      await tx.esvVerseCache.deleteMany({
        where: { id: { in: oldest.map((row) => row.id) } }
      });
    }

    const expiresAt = new Date(now.getTime() + getCacheTtlMs());
    await tx.esvVerseCache.createMany({
      data: versesToStore.map((verse) => ({
        book: input.metadata.book,
        bookOrder: input.metadata.bookOrder,
        chapter: input.chapter,
        verse: verse.verse,
        text: verse.text,
        expiresAt,
        lastAccessedAt: now
      }))
    });
  });
}

export async function getEsvBiblePassage(input: {
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
}): Promise<{ book: string; verses: EsvVerse[] } | null> {
  const metadata = await getChapterMetadata(input);
  if (!metadata) {
    return null;
  }
  const firstChapterVerse = metadata.chapterVerseNumbers[0];
  const lastChapterVerse =
    metadata.chapterVerseNumbers[metadata.chapterVerseNumbers.length - 1];
  const verseStart = input.verseStart ?? firstChapterVerse;
  const verseEnd = input.verseEnd ?? input.verseStart ?? lastChapterVerse;
  const requestedNumbers = metadata.chapterVerseNumbers.filter(
    (verse) => verse >= verseStart && verse <= verseEnd
  );
  if (
    requestedNumbers.length === 0 ||
    requestedNumbers[0] !== verseStart ||
    requestedNumbers[requestedNumbers.length - 1] !== verseEnd ||
    requestedNumbers.length !== verseEnd - verseStart + 1
  ) {
    return null;
  }
  const maximumAllowedVerses = Math.min(
    500,
    Math.floor(metadata.bookVerseCount * ESV_BOOK_SAFETY_RATIO)
  );
  if (requestedNumbers.length > maximumAllowedVerses) {
    throw new BibleProviderError(
      "The requested ESV passage exceeds the display limit.",
      "esv",
      "request_too_large"
    );
  }

  const now = new Date();
  const cached = await prisma.esvVerseCache.findMany({
    where: {
      bookOrder: metadata.bookOrder,
      chapter: input.chapter,
      verse: { in: requestedNumbers },
      expiresAt: { gt: now }
    },
    orderBy: { verse: "asc" },
    select: { id: true, verse: true, text: true }
  });
  const byVerse = new Map<number, EsvVerse>(
    cached.map((row) => [
      row.verse,
      { verse: row.verse, paragraph: 1, text: row.text }
    ])
  );
  if (cached.length > 0) {
    await prisma.esvVerseCache.updateMany({
      where: { id: { in: cached.map((row) => row.id) } },
      data: { lastAccessedAt: now }
    });
  }

  const missing = requestedNumbers.filter((verse) => !byVerse.has(verse));
  if (missing.length > 0) {
    const maximumQuerySize = maximumAllowedVerses;
    if (maximumQuerySize < 1) {
      throw new BibleProviderError(
        "The requested ESV passage exceeds the edition limits.",
        "esv",
        "request_too_large"
      );
    }
    const fetched: EsvVerse[] = [];
    for (const range of contiguousRanges(missing, maximumQuerySize)) {
      const segment = await fetchEsvSegment({
        book: metadata.book,
        chapter: input.chapter,
        ...range
      });
      fetched.push(...segment);
      for (const verse of segment) {
        byVerse.set(verse.verse, verse);
      }
    }
    await cacheFetchedVerses({
      metadata,
      chapter: input.chapter,
      verses: fetched
    });
  }

  const verses = requestedNumbers
    .map((verse) => byVerse.get(verse))
    .filter(
      (verse): verse is EsvVerse => Boolean(verse && verse.text.length > 0)
    );
  if (verses.length === 0) {
    return null;
  }
  if (requestedNumbers.some((verse) => !byVerse.has(verse))) {
    throw new BibleProviderError(
      "The ESV passage could not be assembled.",
      "esv",
      "invalid_response"
    );
  }
  return { book: metadata.book, verses };
}

export const __testables = {
  buildQueryReference,
  contiguousRanges,
  ESV_BOOK_SAFETY_RATIO,
  getCacheMaxVerses,
  parseRetryAfter
};
