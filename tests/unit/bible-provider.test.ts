import type { BibleVersion } from "@/lib/bible";

const providerMocks = vi.hoisted(() => ({
  getDbsChapter: vi.fn(),
  getDbsVersion: vi.fn(),
  resolveLocal: vi.fn(),
  getLocalChapter: vi.fn()
}));

vi.mock("@/lib/dbs-bible", async () => {
  const actual = await vi.importActual<typeof import("@/lib/dbs-bible")>(
    "@/lib/dbs-bible"
  );
  return {
    ...actual,
    getDbsBibleChapter: providerMocks.getDbsChapter,
    getDbsBibleVersion: providerMocks.getDbsVersion
  };
});

vi.mock("@/lib/local-bible", async () => {
  const actual = await vi.importActual<typeof import("@/lib/local-bible")>(
    "@/lib/local-bible"
  );
  return {
    ...actual,
    resolvePassageFromLocalBible: providerMocks.resolveLocal,
    getChapterFromLocalBible: providerMocks.getLocalChapter
  };
});

import {
  getChapterFromBible,
  resolvePassageFromBible
} from "@/lib/bible-provider";

const arabicVersion: BibleVersion = {
  value: "dbs:ARBVDV",
  provider: "dbs",
  providerId: "ARBVDV",
  label: "Arabic Van Dyck Bible",
  title: "Arabic Van Dyck Bible",
  vernacularTitle: "الكتاب المقدس",
  languageName: "Arabic",
  languageIso: "arb",
  script: "Arab",
  direction: "rtl",
  year: 1865,
  copyright: "Copyright owner",
  originalLanguage: false
};

describe("Bible provider facade", () => {
  it("routes local translations through the existing local provider", async () => {
    const localResult = {
      ok: false as const,
      reason: "not_found" as const,
      message: "local result"
    };
    providerMocks.resolveLocal.mockResolvedValue(localResult);

    await expect(
      resolvePassageFromBible({ reference: "John 3:16", translation: "web" })
    ).resolves.toBe(localResult);
    expect(providerMocks.getDbsChapter).not.toHaveBeenCalled();
  });

  it("resolves a DBS range with canonical metadata and empty notes", async () => {
    providerMocks.getDbsVersion.mockResolvedValue(arabicVersion);
    providerMocks.getDbsChapter.mockResolvedValue([
      { verse: 1, paragraph: 1, text: "one" },
      { verse: 2, paragraph: 1, text: "two" },
      { verse: 3, paragraph: 1, text: "three" }
    ]);

    const result = await resolvePassageFromBible({
      reference: "John 3:2-3",
      translation: "dbs:arbvdv"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected a resolved passage.");
    }
    expect(result.resolvedReference).toBe("John 3:2-3");
    expect(result.selectedVerses).toEqual([
      { verse: 2, paragraph: 1, text: "two", notes: [] },
      { verse: 3, paragraph: 1, text: "three", notes: [] }
    ]);
    expect(result.source).toMatchObject({
      provider: "dbs",
      providerId: "ARBVDV",
      translation: "dbs:ARBVDV",
      direction: "rtl",
      copyright: "Copyright owner"
    });
    expect(providerMocks.getDbsChapter).toHaveBeenCalledWith({
      translation: "dbs:ARBVDV",
      book: "John",
      chapter: 3
    });
  });

  it("returns not found for the DBS empty-chapter response", async () => {
    providerMocks.getDbsVersion.mockResolvedValue(arabicVersion);
    providerMocks.getDbsChapter.mockResolvedValue([]);

    const result = await resolvePassageFromBible({
      reference: "John 999",
      translation: "dbs:ARBVDV"
    });

    expect(result).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("rejects a range when DBS does not contain its requested end verse", async () => {
    providerMocks.getDbsVersion.mockResolvedValue(arabicVersion);
    providerMocks.getDbsChapter.mockResolvedValue([
      { verse: 35, paragraph: 1, text: "thirty-five" },
      { verse: 36, paragraph: 1, text: "thirty-six" }
    ]);

    const result = await resolvePassageFromBible({
      reference: "John 3:35-40",
      translation: "dbs:ARBVDV"
    });

    expect(result).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("rejects a range when DBS omits a verse inside it", async () => {
    providerMocks.getDbsVersion.mockResolvedValue(arabicVersion);
    providerMocks.getDbsChapter.mockResolvedValue([
      { verse: 1, paragraph: 1, text: "one" },
      { verse: 3, paragraph: 1, text: "three" }
    ]);

    const result = await resolvePassageFromBible({
      reference: "John 3:1-3",
      translation: "dbs:ARBVDV"
    });

    expect(result).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("returns a chapter in the same shape as the local provider", async () => {
    providerMocks.getDbsVersion.mockResolvedValue(arabicVersion);
    providerMocks.getDbsChapter.mockResolvedValue([
      { verse: 1, paragraph: 1, text: "one" }
    ]);

    const result = await getChapterFromBible({
      books: ["John"],
      chapter: 3,
      translation: "dbs:ARBVDV"
    });

    expect(result.resolvedBook).toBe("John");
    expect(result.data).toMatchObject({
      translation: "dbs:ARBVDV",
      translationName: "Arabic Van Dyck Bible",
      source: { provider: "dbs", languageIso: "arb" },
      verses: [{ verse: 1, text: "one", notes: [] }]
    });
  });
});
