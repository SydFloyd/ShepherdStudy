import { describe, expect, it } from "vitest";

import { inferSourceTranslation } from "@/lib/word-analytics";

describe("inferSourceTranslation", () => {
  it("uses explicit source when provided", () => {
    expect(
      inferSourceTranslation({
        query: "G3056",
        requestedSource: "uhb"
      })
    ).toBe("uhb");
  });

  it("infers greek from strong code", () => {
    expect(
      inferSourceTranslation({
        query: "g30560"
      })
    ).toBe("ugnt");
  });

  it("infers hebrew from strong code", () => {
    expect(
      inferSourceTranslation({
        query: "H7225"
      })
    ).toBe("uhb");
  });

  it("infers greek from lemma script", () => {
    expect(
      inferSourceTranslation({
        query: "λόγος"
      })
    ).toBe("ugnt");
  });

  it("infers hebrew from lemma script", () => {
    expect(
      inferSourceTranslation({
        query: "אֱלֹהִים"
      })
    ).toBe("uhb");
  });

  it("falls back to ugnt when unknown", () => {
    expect(
      inferSourceTranslation({
        query: "word"
      })
    ).toBe("ugnt");
  });
});

