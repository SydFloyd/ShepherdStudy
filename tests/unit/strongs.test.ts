import { describe, expect, it } from "vitest";

import { extractStrongCandidates, normalizeStrongCode } from "@/lib/strongs";

describe("normalizeStrongCode", () => {
  it("normalizes padded Hebrew strong codes", () => {
    expect(normalizeStrongCode("H0430")).toBe("H430");
  });

  it("normalizes padded Greek canonical strong codes", () => {
    expect(normalizeStrongCode("G03588")).toBe("G3588");
  });

  it("normalizes UGNT-style Greek variant-zero codes", () => {
    expect(normalizeStrongCode("G00320")).toBe("G32");
    expect(normalizeStrongCode("G35880")).toBe("G3588");
    expect(normalizeStrongCode("g09760")).toBe("G976");
  });

  it("does not force-trim non-zero Greek suffixes", () => {
    expect(normalizeStrongCode("G00315")).toBe("G315");
  });
});

describe("extractStrongCandidates", () => {
  it("extracts and deduplicates normalized strong codes", () => {
    expect(extractStrongCandidates("G00320 G00320 H0430")).toEqual([
      "G32",
      "H430"
    ]);
  });
});
