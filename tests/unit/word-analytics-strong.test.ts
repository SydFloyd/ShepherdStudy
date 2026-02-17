import { beforeEach, describe, expect, it, vi } from "vitest";

const bibleLexiconFindUnique = vi.fn();
const bibleWordFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bibleLexicon: {
      findUnique: bibleLexiconFindUnique,
      findFirst: vi.fn()
    },
    bibleWord: {
      findMany: bibleWordFindMany
    }
  }
}));

describe("word analytics strong normalization", () => {
  beforeEach(() => {
    bibleLexiconFindUnique.mockReset();
    bibleWordFindMany.mockReset();

    bibleLexiconFindUnique.mockResolvedValue({
      strong: "H430",
      lemma: "אֱלֹהִים",
      translit: "elohim",
      strongsDef: "God, gods",
      kjvDef: "God"
    });

    bibleWordFindMany.mockResolvedValue([
      {
        book: "Genesis",
        bookOrder: 1,
        chapter: 1,
        verse: 1,
        position: 3,
        strong: "H0430"
      }
    ]);
  });

  it("resolves H430 and H0430 to the same canonical result", async () => {
    const { buildWordAnalyticsPayload } = await import("@/lib/word-analytics");

    const direct = await buildWordAnalyticsPayload({ query: "H430" });
    const padded = await buildWordAnalyticsPayload({ query: "H0430" });

    expect(direct).not.toBeNull();
    expect(padded).not.toBeNull();
    expect(direct?.query.resolvedStrong).toBe("H430");
    expect(padded?.query.resolvedStrong).toBe("H430");
    expect(direct?.query.resolvedLemma).toBe("אֱלֹהִים");
    expect(padded?.query.resolvedLemma).toBe("אֱלֹהִים");
    expect(direct?.occurrences.total).toBe(1);
    expect(padded?.occurrences.total).toBe(1);
    expect(direct?.occurrences.items[0]?.reference).toBe("Genesis 1:1");
    expect(padded?.occurrences.items[0]?.reference).toBe("Genesis 1:1");
  });
});

