import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BibleProviderError,
  getBibleProviderPublicError
} from "@/lib/bible-provider-error";
import { __testables, parseEsvPassageText } from "@/lib/esv-bible";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ESV passage parsing", () => {
  it("extracts verse numbers and preserves words across poetry whitespace", () => {
    expect(
      parseEsvPassageText(
        "\n  [1] Blessed is the man\n      who walks not in wicked counsel.\n  [2] But his delight is in the law."
      )
    ).toEqual([
      {
        verse: 1,
        paragraph: 1,
        text: "Blessed is the man who walks not in wicked counsel."
      },
      {
        verse: 2,
        paragraph: 1,
        text: "But his delight is in the law."
      }
    ]);
  });

  it("chunks only contiguous verse numbers within the supplied ceiling", () => {
    expect(__testables.contiguousRanges([1, 2, 3, 5, 6, 9], 2)).toEqual([
      { verseStart: 1, verseEnd: 2 },
      { verseStart: 3, verseEnd: 3 },
      { verseStart: 5, verseEnd: 6 },
      { verseStart: 9, verseEnd: 9 }
    ]);
  });

  it("hard-clamps the shared cache below 500 verses", () => {
    vi.stubEnv("ESV_CACHE_MAX_VERSES", "9999");
    expect(__testables.getCacheMaxVerses()).toBe(450);
    expect(__testables.ESV_BOOK_SAFETY_RATIO).toBeLessThan(0.5);
  });
});

describe("ESV public errors", () => {
  it("gives a specific, retryable quota message", () => {
    const error = new BibleProviderError(
      "internal quota detail",
      "esv",
      "quota_exhausted",
      429,
      42
    );
    expect(getBibleProviderPublicError(error)).toEqual({
      message:
        "The shared ESV request allowance is temporarily exhausted. Please try another translation or return later.",
      status: 429,
      retryAfterSeconds: 42
    });
  });
});
