import { describe, expect, it } from "vitest";

import {
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
