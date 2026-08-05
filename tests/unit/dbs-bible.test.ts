import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { __testables, DbsBibleError, getDbsBookId } from "@/lib/dbs-bible";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("Digital Bible Society normalization", () => {
  it("maps ShepherdStudy book names to DBS USFM book identifiers", () => {
    expect(getDbsBookId("Genesis")).toBe("GEN");
    expect(getDbsBookId("Song of Solomon")).toBe("SNG");
    expect(getDbsBookId("Ezekiel")).toBe("EZK");
    expect(getDbsBookId("Mark")).toBe("MRK");
    expect(getDbsBookId("John")).toBe("JHN");
    expect(getDbsBookId("James")).toBe("JAS");
    expect(getDbsBookId("1 John")).toBe("1JN");
    expect(getDbsBookId("Not a book")).toBeNull();
  });

  it("sorts verse keys numerically and combines split verse parts", () => {
    const verses = __testables.normalizeDbsChapterPayload(
      [
        {
          "JN3.10": " verse ten ",
          "JN3.2": "verse two",
          "JN3.1a": "verse one, part a",
          "JN3.1b": "part b",
          "JN4.1": "wrong chapter",
          malformed: "ignored",
          "JN3.3": 3,
        },
      ],
      3,
    );

    expect(verses).toEqual([
      {
        verse: 1,
        paragraph: 1,
        text: "verse one, part a part b",
      },
      { verse: 2, paragraph: 1, text: "verse two" },
      { verse: 10, paragraph: 1, text: "verse ten" },
    ]);
  });

  it("treats the DBS empty-chapter sentinel as no verses", () => {
    expect(__testables.normalizeDbsChapterPayload([{}], 999)).toEqual([]);
  });

  it("rejects chapter payloads with excessive records, keys, or text", () => {
    expect(() =>
      __testables.parseAndNormalizeDbsChapterPayload(
        Array.from({ length: 6 }, () => ({})),
        3,
      ),
    ).toThrowError(DbsBibleError);

    const tooManyKeys = Object.fromEntries(
      Array.from(
        { length: __testables.DBS_MAX_CHAPTER_KEYS + 1 },
        (_, index) => [`ignored-${index}`, "x"],
      ),
    );
    expect(() =>
      __testables.parseAndNormalizeDbsChapterPayload([tooManyKeys], 3),
    ).toThrow("too many entries");

    expect(() =>
      __testables.parseAndNormalizeDbsChapterPayload(
        [
          {
            ["x".repeat(__testables.DBS_MAX_CHAPTER_KEY_LENGTH + 1)]: "x",
          },
        ],
        3,
      ),
    ).toThrow("invalid verse key");

    expect(() =>
      __testables.parseAndNormalizeDbsChapterPayload(
        [
          {
            "JN3.1": "x".repeat(__testables.DBS_MAX_VERSE_TEXT_LENGTH + 1),
          },
        ],
        3,
      ),
    ).toThrow("oversized verse text");

    const excessiveChapterText = Object.fromEntries(
      Array.from({ length: 26 }, (_, index) => [
        `JN3.${index + 1}`,
        "x".repeat(__testables.DBS_MAX_VERSE_TEXT_LENGTH),
      ]),
    );
    expect(() =>
      __testables.parseAndNormalizeDbsChapterPayload([excessiveChapterText], 3),
    ).toThrow("too much verse text");

    const splitVerse = Object.fromEntries(
      ["a", "b", "c"].map((suffix) => [
        `JN3.1${suffix}`,
        "x".repeat(__testables.DBS_MAX_VERSE_TEXT_LENGTH),
      ]),
    );
    expect(() =>
      __testables.parseAndNormalizeDbsChapterPayload([splitVerse], 3),
    ).toThrow("oversized combined verse text");
  });

  it("keeps source metadata, derives RTL, and removes local duplicates", () => {
    const catalog = __testables.normalizeDbsBibleCatalog(
      [
        {
          abbr: "ENGWEB",
          title: "World English Bible",
          iso: "eng",
          script: "Latn",
          year: 2000,
          copyright: "Public Domain",
        },
        {
          abbr: "ARBVDV",
          title: "Arabic Van Dyck Bible",
          title_vernacular: "الكتاب المقدس",
          iso: "arb",
          script: "Arab",
          year: 1865,
          copyright: "Copyright owner",
        },
        {
          abbr: "BAD.ID",
          title: "Unsupported identifier",
          iso: "eng",
          script: "Latn",
        },
      ],
      [
        {
          id: "ARBVDV",
          tt: "Arabic Van Dyck Bible",
          tv: "الكتاب المقدس",
          iso: "arb",
          sc: "Arab",
          dt: 1865,
          ln: "Arabic",
        },
      ],
    );

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      value: "dbs:ARBVDV",
      provider: "dbs",
      providerId: "ARBVDV",
      languageName: "Arabic",
      languageIso: "arb",
      script: "Arab",
      direction: "rtl",
      copyright: "Copyright owner",
    });
  });

  it("keeps valid primary catalog rows and ignores malformed enrichment rows", () => {
    const catalog = __testables.normalizeDbsCatalogPayload(
      [
        {
          abbr: "BAD.ID",
          title: "Invalid identifier",
          iso: "eng",
        },
        {
          abbr: "ARBVDV",
          title: "Arabic Van Dyck Bible",
          iso: "arb",
          script: "Arab",
        },
      ],
      [
        { id: "BAD.ID", iso: "eng", ln: "Invalid" },
        { id: "ARBVDV", iso: "arb", ln: "Arabic" },
        { changed: "shape" },
      ],
    );

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      providerId: "ARBVDV",
      languageName: "Arabic",
    });
  });

  it("treats compact catalog metadata as optional enrichment", () => {
    const catalog = __testables.normalizeDbsCatalogPayload(
      [
        {
          abbr: "ARBVDV",
          title: "Arabic Van Dyck Bible",
          iso: "arb",
          script: "Arab",
        },
      ],
      { changed: "wrapper" },
    );

    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({
      providerId: "ARBVDV",
      languageName: "ARB",
    });
  });

  it("rejects a primary catalog with no valid editions", () => {
    expect(() =>
      __testables.normalizeDbsCatalogPayload(
        [{ abbr: "BAD.ID", title: "Invalid", iso: "eng" }],
        [],
      ),
    ).toThrowError(DbsBibleError);

    let thrown: unknown;
    try {
      __testables.normalizeDbsCatalogPayload([], []);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DbsBibleError);
    expect((thrown as DbsBibleError).code).toBe("invalid_response");
  });
});

describe("Digital Bible Society request protection", () => {
  it("enforces a wall-clock deadline even while response bytes arrive", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      const interval = setInterval(() => response.write(" "), 10);
      response.once("close", () => clearInterval(interval));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        server.off("error", reject);
        resolve();
      });
    });

    try {
      const address = server.address() as AddressInfo;
      await expect(
        __testables.requestDbsTextOnce(
          new URL(`http://127.0.0.1:${address.port}/slow`),
          1_024,
          100,
        ),
      ).rejects.toMatchObject({
        code: "unavailable",
        circuitFailure: true,
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("does not count request-specific or invalid responses against the circuit", () => {
    __testables.resetDbsRequestProtection();

    try {
      for (let index = 0; index < 5; index += 1) {
        __testables.recordDbsFailure(
          new DbsBibleError("invalid payload", "invalid_response"),
        );
        __testables.recordDbsFailure(
          new DbsBibleError("bad request", "unavailable", 400),
        );
      }

      expect(__testables.getDbsRequestProtectionState()).toMatchObject({
        consecutiveFailures: 0,
        circuitOpen: false,
      });
    } finally {
      __testables.resetDbsRequestProtection();
    }
  });

  it("rejects work beyond the bounded waiting queue", async () => {
    __testables.resetDbsRequestProtection();
    const blockers = Array.from(
      { length: __testables.DBS_MAX_CONCURRENT_REQUESTS },
      deferred,
    );
    const active = blockers.map((blocker) =>
      __testables.withDbsRequestSlot(() => blocker.promise),
    );
    const queued = Array.from(
      { length: __testables.DBS_MAX_QUEUED_REQUESTS },
      () => __testables.withDbsRequestSlot(async () => "admitted"),
    );

    try {
      expect(__testables.DBS_MAX_QUEUED_REQUESTS).toBe(12);
      expect(__testables.getDbsRequestProtectionState()).toMatchObject({
        active: 4,
        queued: 12,
      });
      await expect(
        __testables.withDbsRequestSlot(async () => "unexpected"),
      ).rejects.toThrow("queue is temporarily full");

      blockers.forEach((blocker) => blocker.resolve());
      expect(await Promise.all(queued)).toEqual(
        Array.from({ length: 12 }, () => "admitted"),
      );
    } finally {
      blockers.forEach((blocker) => blocker.resolve());
      await Promise.allSettled([...active, ...queued]);
      __testables.resetDbsRequestProtection();
    }
  });

  it("expires queued work after two seconds", async () => {
    vi.useFakeTimers();
    __testables.resetDbsRequestProtection();
    const blockers = Array.from(
      { length: __testables.DBS_MAX_CONCURRENT_REQUESTS },
      deferred,
    );
    const active = blockers.map((blocker) =>
      __testables.withDbsRequestSlot(() => blocker.promise),
    );

    try {
      const operation = vi.fn(async () => "unexpected");
      const queuedResult = __testables
        .withDbsRequestSlot(operation)
        .catch((error: unknown) => error);

      expect(__testables.DBS_MAX_QUEUED_REQUESTS).toBe(12);
      expect(__testables.DBS_QUEUE_TIMEOUT_MS).toBe(2_000);
      expect(__testables.getDbsRequestProtectionState()).toMatchObject({
        active: 4,
        queued: 1,
      });

      await vi.advanceTimersByTimeAsync(__testables.DBS_QUEUE_TIMEOUT_MS);

      const error = await queuedResult;
      expect(error).toBeInstanceOf(DbsBibleError);
      expect((error as Error).message).toContain("queue timed out");
      expect(operation).not.toHaveBeenCalled();
      expect(__testables.getDbsRequestProtectionState().queued).toBe(0);
    } finally {
      blockers.forEach((blocker) => blocker.resolve());
      await Promise.allSettled(active);
      __testables.resetDbsRequestProtection();
      vi.useRealTimers();
    }
  });

  it("rejects queued and new work when the circuit opens", async () => {
    __testables.resetDbsRequestProtection();
    const blockers = Array.from(
      { length: __testables.DBS_MAX_CONCURRENT_REQUESTS },
      deferred,
    );
    const active = blockers.map((blocker) =>
      __testables.withDbsRequestSlot(() => blocker.promise),
    );

    try {
      const operation = vi.fn(async () => "unexpected");
      const queuedResult = __testables
        .withDbsRequestSlot(operation)
        .catch((error: unknown) => error);

      // Let the four admitted operations enter their callbacks so the fifth
      // operation is genuinely waiting when the circuit opens.
      await Promise.resolve();
      expect(__testables.getDbsRequestProtectionState()).toMatchObject({
        active: 4,
        queued: 1,
      });

      __testables.recordDbsFailure(new Error("upstream failed"));
      __testables.recordDbsFailure(new Error("upstream failed"));
      __testables.recordDbsFailure(new Error("upstream failed"));

      const error = await queuedResult;
      expect(error).toBeInstanceOf(DbsBibleError);
      expect(operation).not.toHaveBeenCalled();
      expect(__testables.getDbsRequestProtectionState()).toMatchObject({
        active: 4,
        queued: 0,
        consecutiveFailures: 3,
        circuitOpen: true,
      });
      await expect(
        __testables.withDbsRequestSlot(async () => "unexpected"),
      ).rejects.toMatchObject({ code: "unavailable" });
    } finally {
      blockers.forEach((blocker) => blocker.resolve());
      await Promise.allSettled(active);
      __testables.resetDbsRequestProtection();
    }
  });
});
