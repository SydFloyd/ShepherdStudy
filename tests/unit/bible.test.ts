import { describe, expect, it } from "vitest";

import {
  bibleLanguageIsoSchema,
  bibleTranslationIdSchema,
  getBibleTextDirection
} from "@/lib/bible";

describe("Bible translation identifiers", () => {
  it("accepts local and namespaced DBS identifiers", () => {
    expect(bibleTranslationIdSchema.safeParse("web").success).toBe(true);
    expect(bibleTranslationIdSchema.safeParse("dbs:ARBVDV").success).toBe(
      true
    );
  });

  it("rejects malformed or unnamespaced remote identifiers", () => {
    for (const value of ["ARBVDV", "dbs:bad.id", "dbs:../secret", "dbs:x"]) {
      expect(bibleTranslationIdSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("Bible language identifiers", () => {
  it("normalizes valid language identifiers", () => {
    expect(bibleLanguageIsoSchema.parse(" ENG ")).toBe("eng");
    expect(bibleLanguageIsoSchema.parse("zh-Hant")).toBe("zh-hant");
  });

  it("rejects malformed language identifiers", () => {
    for (const value of ["e", "english!", "../eng", "a".repeat(17)]) {
      expect(bibleLanguageIsoSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("Bible text direction", () => {
  it.each([
    "Arab",
    "arab",
    "Aran",
    "Hebr",
    "Khoj",
    "Syrc",
    "Syrj",
    "Thaa",
    "Nkoo"
  ])(
    "treats %s as right-to-left",
    (script) => {
      expect(getBibleTextDirection({ script })).toBe("rtl");
    }
  );

  it.each(["Latn", "Grek", "Cyrl", "Deva", "Zyyy"])(
    "treats %s as left-to-right",
    (script) => {
      expect(getBibleTextDirection({ script })).toBe("ltr");
    }
  );
});
