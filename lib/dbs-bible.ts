import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import { unstable_cache } from "next/cache";
import { z } from "zod";

import {
  BibleVersion,
  BOOK_CODE_ENTRIES,
  DBS_LOCAL_EQUIVALENTS,
  getBibleTextDirection,
  getDbsBibleId,
  isDbsBibleId,
  toDbsTranslationId,
} from "@/lib/bible";

const DBS_CATALOG_REVALIDATE_SECONDS = 86_400;
const DBS_CHAPTER_REVALIDATE_SECONDS = 7 * 86_400;
const DBS_TIMEOUT_MS = 8_000;
const DBS_MAX_CATALOG_BYTES = 8_000_000;
const DBS_MAX_CHAPTER_BYTES = 2_000_000;
const DBS_MAX_CONCURRENT_REQUESTS = 4;
const DBS_MAX_QUEUED_REQUESTS = 12;
const DBS_QUEUE_TIMEOUT_MS = 2_000;
const DBS_CIRCUIT_FAILURE_THRESHOLD = 3;
const DBS_CIRCUIT_COOLDOWN_MS = 30_000;
const DBS_MAX_CATALOG_EDITIONS = 10_000;
const DBS_MAX_CHAPTER_RECORDS = 5;
const DBS_MAX_CHAPTER_KEYS = 2_000;
const DBS_MAX_CHAPTER_KEY_LENGTH = 64;
const DBS_MAX_VERSE_TEXT_LENGTH = 10_000;
const DBS_MAX_NORMALIZED_VERSE_TEXT_LENGTH = 10_000;
const DBS_MAX_CHAPTER_TEXT_LENGTH = 100_000;
const DBS_USER_AGENT =
  "ShepherdStudy/1.0 (Scripture access; +https://shepstudy.com/info; contact@shepstudy.com)";

const textEditionSchema = z
  .object({
    abbr: z.string().trim().min(2).max(48).refine(isDbsBibleId),
    title: z.string().trim().min(1).max(500),
    title_vernacular: z.string().trim().max(500).nullish(),
    iso: z.string().trim().min(2).max(12),
    script: z.string().trim().max(12).nullish(),
    year: z.number().int().min(0).max(3000).nullish(),
    copyright: z.string().trim().max(2_000).nullish(),
  })
  .passthrough();

const compactEditionSchema = z
  .object({
    id: z.string().trim().min(2).max(48).refine(isDbsBibleId),
    tt: z.string().trim().max(500).nullish(),
    tv: z.string().trim().max(500).nullish(),
    iso: z.string().trim().min(2).max(12),
    sc: z.string().trim().max(12).nullish(),
    dt: z.number().int().min(0).max(3000).nullish(),
    ln: z.string().trim().max(200).nullish(),
  })
  .passthrough();

export class DbsBibleError extends Error {
  constructor(
    message: string,
    readonly code: "unavailable" | "invalid_response" | "not_found",
    readonly status?: number,
    readonly circuitFailure = false,
  ) {
    super(message);
    this.name = "DbsBibleError";
  }
}

type DbsRequestQueueEntry = {
  resolve: () => void;
  reject: (error: DbsBibleError) => void;
  timeout: ReturnType<typeof setTimeout>;
};

let activeDbsRequests = 0;
const dbsRequestQueue: DbsRequestQueueEntry[] = [];
const inFlightDbsRequests = new Map<string, Promise<string>>();
let consecutiveDbsFailures = 0;
let dbsCircuitOpenUntil = 0;

function dbsUnavailableError(message: string) {
  return new DbsBibleError(message, "unavailable");
}

function rejectQueuedDbsRequests(error: DbsBibleError) {
  while (dbsRequestQueue.length > 0) {
    const queued = dbsRequestQueue.shift();
    if (!queued) {
      continue;
    }
    clearTimeout(queued.timeout);
    queued.reject(error);
  }
}

function releaseDbsRequestSlot() {
  activeDbsRequests = Math.max(0, activeDbsRequests - 1);

  if (Date.now() < dbsCircuitOpenUntil) {
    rejectQueuedDbsRequests(
      dbsUnavailableError(
        "The Digital Bible Society is temporarily unavailable.",
      ),
    );
    return;
  }

  const queued = dbsRequestQueue.shift();
  if (!queued) {
    return;
  }
  clearTimeout(queued.timeout);
  // Reserve the released slot before waking the waiter so a new request cannot
  // race ahead of it and exceed the concurrency ceiling.
  activeDbsRequests += 1;
  queued.resolve();
}

async function acquireDbsRequestSlot() {
  assertDbsCircuitAvailable();

  if (activeDbsRequests < DBS_MAX_CONCURRENT_REQUESTS) {
    activeDbsRequests += 1;
    return;
  }

  if (dbsRequestQueue.length >= DBS_MAX_QUEUED_REQUESTS) {
    throw dbsUnavailableError(
      "The Digital Bible Society request queue is temporarily full.",
    );
  }

  await new Promise<void>((resolve, reject) => {
    const entry = {} as DbsRequestQueueEntry;
    entry.resolve = resolve;
    entry.reject = reject;
    entry.timeout = setTimeout(() => {
      const index = dbsRequestQueue.indexOf(entry);
      if (index === -1) {
        return;
      }
      dbsRequestQueue.splice(index, 1);
      reject(
        dbsUnavailableError(
          "The Digital Bible Society request queue timed out.",
        ),
      );
    }, DBS_QUEUE_TIMEOUT_MS);
    dbsRequestQueue.push(entry);
  });
}

async function withDbsRequestSlot<T>(operation: () => Promise<T>): Promise<T> {
  await acquireDbsRequestSlot();

  try {
    // The circuit can open while this request is waiting for a slot.
    assertDbsCircuitAvailable();
    return await operation();
  } finally {
    releaseDbsRequestSlot();
  }
}

function assertDbsCircuitAvailable() {
  if (Date.now() < dbsCircuitOpenUntil) {
    throw new DbsBibleError(
      "The Digital Bible Society is temporarily unavailable.",
      "unavailable",
    );
  }
}

function recordDbsSuccess() {
  // A request that was already in flight when the circuit opened must not
  // erase the cooldown established by concurrent provider failures.
  if (Date.now() < dbsCircuitOpenUntil) {
    return;
  }
  consecutiveDbsFailures = 0;
  dbsCircuitOpenUntil = 0;
}

function recordDbsFailure(error: unknown) {
  if (error instanceof DbsBibleError && !error.circuitFailure) {
    return;
  }
  consecutiveDbsFailures += 1;
  if (consecutiveDbsFailures >= DBS_CIRCUIT_FAILURE_THRESHOLD) {
    dbsCircuitOpenUntil = Date.now() + DBS_CIRCUIT_COOLDOWN_MS;
    rejectQueuedDbsRequests(
      dbsUnavailableError(
        "The Digital Bible Society is temporarily unavailable.",
      ),
    );
  }
}

function getDbsBaseUrl() {
  const configured = process.env.DBS_API_BASE_URL?.trim();
  const base = configured || "https://arc.dbs.org";
  const url = new URL(base);
  if (url.protocol !== "https:" && process.env.NODE_ENV === "production") {
    throw new DbsBibleError(
      "DBS_API_BASE_URL must use HTTPS in production.",
      "unavailable",
    );
  }
  return url;
}

function requestDbsTextOnce(
  url: URL,
  maxBytes: number,
  timeoutMs = DBS_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === "http:" ? httpRequest : httpsRequest;
    let settled = false;
    const clearWallClockTimeout = () => {
      clearTimeout(wallClockTimeout);
    };
    const finishWithError = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearWallClockTimeout();
      reject(error);
    };
    const finishWithSuccess = (value: string) => {
      if (settled) {
        return;
      }
      settled = true;
      clearWallClockTimeout();
      resolve(value);
    };

    const req = request(
      url,
      {
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "identity",
          "User-Agent": DBS_USER_AGENT,
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          finishWithError(
            new DbsBibleError(
              `The Digital Bible Society API returned ${status || "an invalid status"}.`,
              status === 404 ? "not_found" : "unavailable",
              status || undefined,
              status === 429 || status >= 500,
            ),
          );
          response.destroy();
          return;
        }

        const rawContentType = response.headers["content-type"];
        const contentType = Array.isArray(rawContentType)
          ? rawContentType[0]
          : rawContentType;
        if (!contentType?.toLowerCase().includes("application/json")) {
          finishWithError(
            new DbsBibleError(
              "The Digital Bible Society returned an unexpected content type.",
              "invalid_response",
            ),
          );
          response.destroy();
          return;
        }

        const declaredLength = Number(response.headers["content-length"]);
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          finishWithError(
            new DbsBibleError(
              "The Digital Bible Society response was unexpectedly large.",
              "invalid_response",
            ),
          );
          response.destroy();
          return;
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        response.on("data", (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.length;
          if (receivedBytes > maxBytes) {
            response.destroy(
              new DbsBibleError(
                "The Digital Bible Society response was unexpectedly large.",
                "invalid_response",
              ),
            );
            return;
          }
          chunks.push(buffer);
        });
        response.on("error", finishWithError);
        response.on("aborted", () => {
          finishWithError(
            new DbsBibleError(
              "The Digital Bible Society response ended unexpectedly.",
              "unavailable",
              undefined,
              true,
            ),
          );
        });
        response.on("end", () => {
          finishWithSuccess(Buffer.concat(chunks).toString("utf8"));
        });
      },
    );

    const timeoutError = () =>
      new DbsBibleError(
        "The Digital Bible Society request timed out.",
        "unavailable",
        undefined,
        true,
      );
    const wallClockTimeout = setTimeout(() => {
      req.destroy(timeoutError());
    }, timeoutMs);
    req.setTimeout(timeoutMs, () => {
      req.destroy(timeoutError());
    });
    req.on("error", finishWithError);
    req.end();
  });
}

function requestDbsText(url: URL, maxBytes: number): Promise<string> {
  const key = `${url.toString()}|${maxBytes}`;
  const existing = inFlightDbsRequests.get(key);
  if (existing) {
    return existing;
  }

  const request = withDbsRequestSlot(() => requestDbsTextOnce(url, maxBytes));
  inFlightDbsRequests.set(key, request);
  const clearRequest = () => {
    if (inFlightDbsRequests.get(key) === request) {
      inFlightDbsRequests.delete(key);
    }
  };
  void request.then(clearRequest, clearRequest);
  return request;
}

function isRetryableDbsError(error: unknown) {
  if (!(error instanceof DbsBibleError)) {
    return true;
  }
  return (
    error.circuitFailure && error.code === "unavailable" && error.status !== 429
  );
}

async function requestDbsJson(input: {
  baseUrl: string;
  path: string;
  maxBytes: number;
}): Promise<unknown> {
  const url = new URL(input.path, input.baseUrl);
  let lastError: unknown;
  assertDbsCircuitAvailable();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await requestDbsText(url, input.maxBytes);
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        throw new DbsBibleError(
          "The Digital Bible Society returned invalid JSON.",
          "invalid_response",
        );
      }
    } catch (error) {
      lastError = error;
      if (attempt === 1 || !isRetryableDbsError(error)) {
        break;
      }
    }
  }

  recordDbsFailure(lastError);

  if (lastError instanceof DbsBibleError) {
    throw lastError;
  }
  throw new DbsBibleError(
    "The Digital Bible Society is temporarily unavailable.",
    "unavailable",
  );
}

function parseDbsPayload<T>(schema: z.ZodType<T>, json: unknown): T {
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new DbsBibleError(
      "The Digital Bible Society response did not match the expected format.",
      "invalid_response",
    );
  }
  return parsed.data;
}

function parseDbsCatalogRows<T>(schema: z.ZodType<T>, payload: unknown): T[] {
  if (!Array.isArray(payload) || payload.length > DBS_MAX_CATALOG_EDITIONS) {
    return [];
  }

  const rows: T[] = [];
  for (const candidate of payload) {
    const parsed = schema.safeParse(candidate);
    if (parsed.success) {
      rows.push(parsed.data);
    }
  }
  return rows;
}

function normalizeDbsCatalogPayload(
  textPayload: unknown,
  compactPayload: unknown,
): BibleVersion[] {
  const textEditions = parseDbsCatalogRows(textEditionSchema, textPayload);
  if (textEditions.length === 0) {
    throw new DbsBibleError(
      "The Digital Bible Society catalog did not contain any valid text editions.",
      "invalid_response",
    );
  }

  // Compact metadata is optional enrichment. Invalid rows or a changed wrapper
  // must not make otherwise usable Scripture editions disappear.
  const compactEditions = parseDbsCatalogRows(
    compactEditionSchema,
    compactPayload,
  );
  return normalizeDbsBibleCatalog(textEditions, compactEditions);
}

const getCachedDbsCatalog = unstable_cache(
  async (baseUrl: string) => {
    const [textPayload, compactPayload] = await Promise.all([
      requestDbsJson({
        baseUrl,
        path: "/api/bible-text/",
        maxBytes: DBS_MAX_CATALOG_BYTES,
      }),
      requestDbsJson({
        baseUrl,
        path: "/api/bibles?require_source=true",
        maxBytes: DBS_MAX_CATALOG_BYTES,
      }).catch(() => []),
    ]);
    const catalog = normalizeDbsCatalogPayload(textPayload, compactPayload);
    recordDbsSuccess();
    return catalog;
  },
  ["dbs-normalized-catalog-v1"],
  { revalidate: DBS_CATALOG_REVALIDATE_SECONDS, tags: ["dbs-bible-catalog"] },
);

async function fetchAndNormalizeDbsChapter(
  baseUrl: string,
  bibleId: string,
  bookId: string,
  chapter: number,
) {
  const verses = parseAndNormalizeDbsChapterPayload(
    await requestDbsJson({
      baseUrl,
      path: `/api/bible-text/${encodeURIComponent(bibleId)}/${encodeURIComponent(
        bookId,
      )}/${chapter}`,
      maxBytes: DBS_MAX_CHAPTER_BYTES,
    }),
    chapter,
  );
  recordDbsSuccess();
  return verses;
}

const getCachedDbsChapter = unstable_cache(
  fetchAndNormalizeDbsChapter,
  ["dbs-bible-chapter-v2"],
  { revalidate: DBS_CHAPTER_REVALIDATE_SECONDS, tags: ["dbs-bible-chapters"] },
);

export async function getDbsBibleCatalog(): Promise<BibleVersion[]> {
  return getCachedDbsCatalog(getDbsBaseUrl().toString());
}

function normalizeDbsBibleCatalog(
  textEditions: Array<z.infer<typeof textEditionSchema>>,
  compactResult: Array<z.infer<typeof compactEditionSchema>>,
): BibleVersion[] {
  const compactById = new Map(
    compactResult.map((edition) => [edition.id.toUpperCase(), edition]),
  );

  return textEditions
    .filter(
      (edition) =>
        isDbsBibleId(edition.abbr) &&
        !DBS_LOCAL_EQUIVALENTS[edition.abbr.toUpperCase()],
    )
    .map((edition): BibleVersion => {
      const compact = compactById.get(edition.abbr.toUpperCase());
      const title = edition.title.trim();
      const vernacularTitle =
        edition.title_vernacular?.trim() || compact?.tv?.trim() || null;
      const script = edition.script?.trim() || compact?.sc?.trim() || "Zyyy";
      const languageName = compact?.ln?.trim() || edition.iso.toUpperCase();
      return {
        value: toDbsTranslationId(edition.abbr),
        provider: "dbs",
        providerId: edition.abbr,
        label: vernacularTitle || title,
        title,
        vernacularTitle,
        languageName,
        languageIso: edition.iso,
        script,
        direction: getBibleTextDirection({ script }),
        year: edition.year ?? compact?.dt ?? null,
        copyright: edition.copyright?.trim() || null,
        originalLanguage: false,
      };
    })
    .sort(
      (left, right) =>
        left.languageName.localeCompare(right.languageName) ||
        left.label.localeCompare(right.label),
    );
}

export async function getDbsBibleVersion(
  translation: string,
): Promise<BibleVersion | null> {
  const bibleId = getDbsBibleId(translation);
  if (!bibleId) {
    return null;
  }
  const catalog = await getDbsBibleCatalog();
  return (
    catalog.find(
      (version) => version.providerId.toUpperCase() === bibleId.toUpperCase(),
    ) ?? null
  );
}

const LOCAL_TO_DBS_BOOK_CODE: Record<string, string> = {
  SOL: "SNG",
  EZE: "EZK",
  JOE: "JOL",
  NAH: "NAM",
  MAR: "MRK",
  JOH: "JHN",
  PHI: "PHP",
  JAM: "JAS",
  "1JO": "1JN",
  "2JO": "2JN",
  "3JO": "3JN",
};

export function getDbsBookId(book: string): string | null {
  const normalized = book.toLowerCase().replace(/[^a-z0-9]/g, "");
  const entry = BOOK_CODE_ENTRIES.find(
    ([, name]) => name.toLowerCase().replace(/[^a-z0-9]/g, "") === normalized,
  );
  if (!entry) {
    return null;
  }
  return LOCAL_TO_DBS_BOOK_CODE[entry[0]] ?? entry[0];
}

const chapterPayloadSchema = z
  .array(z.record(z.unknown()))
  .max(DBS_MAX_CHAPTER_RECORDS);

function normalizeDbsChapterPayload(
  payload: z.infer<typeof chapterPayloadSchema>,
  chapter: number,
) {
  const verses = new Map<number, string[]>();
  const verseTextLengths = new Map<number, number>();
  let chapterKeyCount = 0;
  let chapterTextLength = 0;

  for (const record of payload) {
    const entries = Object.entries(record);
    chapterKeyCount += entries.length;
    if (chapterKeyCount > DBS_MAX_CHAPTER_KEYS) {
      throw new DbsBibleError(
        "The Digital Bible Society chapter contained too many entries.",
        "invalid_response",
      );
    }

    for (const [key, value] of entries) {
      if (key.length > DBS_MAX_CHAPTER_KEY_LENGTH) {
        throw new DbsBibleError(
          "The Digital Bible Society chapter contained an invalid verse key.",
          "invalid_response",
        );
      }
      if (typeof value !== "string" || !value.trim()) {
        continue;
      }
      if (value.length > DBS_MAX_VERSE_TEXT_LENGTH) {
        throw new DbsBibleError(
          "The Digital Bible Society chapter contained oversized verse text.",
          "invalid_response",
        );
      }
      chapterTextLength += value.length;
      if (chapterTextLength > DBS_MAX_CHAPTER_TEXT_LENGTH) {
        throw new DbsBibleError(
          "The Digital Bible Society chapter contained too much verse text.",
          "invalid_response",
        );
      }
      const match = key.match(/(\d+)\.(\d+)(?:[a-z])?$/i);
      if (!match || Number(match[1]) !== chapter) {
        continue;
      }
      const verse = Number(match[2]);
      if (!Number.isSafeInteger(verse) || verse < 1 || verse > 999) {
        continue;
      }
      const text = value.trim();
      const previousVerseTextLength = verseTextLengths.get(verse) ?? 0;
      const nextVerseTextLength =
        previousVerseTextLength +
        (previousVerseTextLength > 0 ? 1 : 0) +
        text.length;
      if (nextVerseTextLength > DBS_MAX_NORMALIZED_VERSE_TEXT_LENGTH) {
        throw new DbsBibleError(
          "The Digital Bible Society chapter contained oversized combined verse text.",
          "invalid_response",
        );
      }
      const existing = verses.get(verse) ?? [];
      existing.push(text);
      verses.set(verse, existing);
      verseTextLengths.set(verse, nextVerseTextLength);
    }
  }

  return Array.from(verses.entries())
    .sort(([left], [right]) => left - right)
    .map(([verse, parts]) => ({
      verse,
      paragraph: 1,
      text: parts.join(" "),
    }));
}

function parseAndNormalizeDbsChapterPayload(payload: unknown, chapter: number) {
  return normalizeDbsChapterPayload(
    parseDbsPayload(chapterPayloadSchema, payload),
    chapter,
  );
}

export async function getDbsBibleChapter(input: {
  translation: string;
  book: string;
  chapter: number;
}): Promise<Array<{ verse: number; paragraph: number; text: string }>> {
  const bibleId = getDbsBibleId(input.translation);
  const bookId = getDbsBookId(input.book);
  if (!bibleId || !bookId) {
    return [];
  }

  if (
    !Number.isSafeInteger(input.chapter) ||
    input.chapter < 1 ||
    input.chapter > 199
  ) {
    return [];
  }

  return getCachedDbsChapter(
    getDbsBaseUrl().toString(),
    bibleId,
    bookId,
    input.chapter,
  );
}

export const __testables = {
  DBS_MAX_CATALOG_BYTES,
  DBS_MAX_CHAPTER_KEYS,
  DBS_MAX_CHAPTER_KEY_LENGTH,
  DBS_MAX_CHAPTER_TEXT_LENGTH,
  DBS_MAX_CHAPTER_BYTES,
  DBS_MAX_CONCURRENT_REQUESTS,
  DBS_MAX_NORMALIZED_VERSE_TEXT_LENGTH,
  DBS_MAX_QUEUED_REQUESTS,
  DBS_MAX_VERSE_TEXT_LENGTH,
  DBS_QUEUE_TIMEOUT_MS,
  LOCAL_TO_DBS_BOOK_CODE,
  getDbsRequestProtectionState: () => ({
    active: activeDbsRequests,
    queued: dbsRequestQueue.length,
    consecutiveFailures: consecutiveDbsFailures,
    circuitOpen: Date.now() < dbsCircuitOpenUntil,
  }),
  fetchAndNormalizeDbsChapter,
  normalizeDbsBibleCatalog,
  normalizeDbsCatalogPayload,
  normalizeDbsChapterPayload,
  parseAndNormalizeDbsChapterPayload,
  parseDbsPayload,
  recordDbsFailure,
  resetDbsRequestProtection: () => {
    for (const queued of dbsRequestQueue.splice(0)) {
      clearTimeout(queued.timeout);
      queued.reject(
        dbsUnavailableError("The Digital Bible Society test state was reset."),
      );
    }
    activeDbsRequests = 0;
    inFlightDbsRequests.clear();
    consecutiveDbsFailures = 0;
    dbsCircuitOpenUntil = 0;
  },
  requestDbsJson,
  requestDbsText,
  requestDbsTextOnce,
  withDbsRequestSlot,
};
