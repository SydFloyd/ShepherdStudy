import {
  assessReferenceRecall,
  getMemorizationSetFingerprint,
  isExactPassageReference,
  parseMemorizationEditionSnapshot,
  passagesOverlap,
  serializeMemorizationPassage,
  toMemorizationStorageData
} from "@/lib/memorization-data";

const psalm23 = {
  reference: "Psalms 23",
  book: "Psalms",
  chapter: 23,
  verseStart: 1,
  verseEnd: 6,
  isWholeChapter: true
};

describe("memorization passage helpers", () => {
  it("treats book aliases and an explicit full range as the same chapter", () => {
    expect(isExactPassageReference(psalm23, "Psalm 23")).toBe(true);
    expect(isExactPassageReference(psalm23, "Psalm 23:1-6")).toBe(true);
    expect(isExactPassageReference(psalm23, "Psalm 23:1-5")).toBe(false);
    expect(assessReferenceRecall(psalm23, "Psalm 23").score).toBe(100);
  });

  it("detects overlapping ranges only within the same version and chapter", () => {
    const base = {
      translation: "web",
      bookOrder: 43,
      chapter: 3,
      verseStart: 14,
      verseEnd: 17
    };

    expect(passagesOverlap(base, { ...base, verseStart: 16, verseEnd: 18 })).toBe(
      true
    );
    expect(passagesOverlap(base, { ...base, verseStart: 18, verseEnd: 19 })).toBe(
      false
    );
    expect(passagesOverlap(base, { ...base, translation: "kjv" })).toBe(false);
  });

  it("creates a stable set fingerprint independent of row order", () => {
    const first = {
      translation: "web",
      bookOrder: 43,
      chapter: 3,
      verseStart: 16,
      verseEnd: 16
    };
    const second = {
      translation: "web",
      bookOrder: 45,
      chapter: 8,
      verseStart: 1,
      verseEnd: 4
    };

    expect(getMemorizationSetFingerprint([first, second])).toBe(
      getMemorizationSetFingerprint([second, first])
    );
    expect(getMemorizationSetFingerprint([first])).not.toBe(
      getMemorizationSetFingerprint([first, second])
    );
  });

  it("returns an immutable edition snapshot with a saved passage", () => {
    const editionSnapshot = {
      translation: "dbs:TESTDBS",
      provider: "dbs" as const,
      providerId: "TESTDBS",
      title: "Test Bible",
      vernacularTitle: "Test Bible",
      languageName: "English",
      languageIso: "eng",
      script: "Latn",
      direction: "ltr" as const,
      year: 2026,
      copyright: "Used with permission."
    };
    const now = new Date("2026-08-05T12:00:00.000Z");

    const serialized = serializeMemorizationPassage({
      id: "passage-1",
      translation: editionSnapshot.translation,
      reference: "John 3:16",
      book: "John",
      bookOrder: 43,
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
      isWholeChapter: false,
      text: "For God so loved the world.",
      verses: [{ verse: 16, text: "For God so loved the world." }],
      editionSnapshot,
      textAttemptCount: 0,
      latestTextScore: null,
      bestTextScore: null,
      referenceAttemptCount: 0,
      latestReferenceScore: null,
      bestReferenceScore: null,
      lastPracticedAt: null,
      createdAt: now,
      updatedAt: now
    });

    expect(serialized.editionSnapshot).toEqual(editionSnapshot);
    expect(
      parseMemorizationEditionSnapshot({
        ...editionSnapshot,
        provider: "untrusted"
      })
    ).toBeNull();
  });

  it("persists ESV memorization references without another raw text copy", () => {
    const stored = toMemorizationStorageData({
      translation: "esv",
      reference: "John 3:16",
      book: "John",
      bookOrder: 43,
      chapter: 3,
      verseStart: 16,
      verseEnd: 16,
      isWholeChapter: false,
      text: "For God so loved the world.",
      verses: [{ verse: 16, text: "For God so loved the world." }],
      editionSnapshot: {
        translation: "esv",
        provider: "esv",
        providerId: "esv",
        title: "English Standard Version",
        vernacularTitle: "English Standard Version",
        languageName: "English",
        languageIso: "eng",
        script: "Latn",
        direction: "ltr",
        year: 2025,
        copyright: "ESV copyright notice"
      }
    });

    expect(stored.text).toBe("");
    expect(stored.verses).toEqual([]);
    expect(stored.reference).toBe("John 3:16");
    expect(stored.editionSnapshot.provider).toBe("esv");
  });
});
