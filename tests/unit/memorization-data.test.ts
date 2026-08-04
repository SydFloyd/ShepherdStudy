import {
  assessReferenceRecall,
  getMemorizationSetFingerprint,
  isExactPassageReference,
  passagesOverlap
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
});
