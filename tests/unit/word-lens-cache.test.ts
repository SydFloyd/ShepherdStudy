import { describe, expect, it } from "vitest";

import {
  buildWordLensCacheKey,
  getWordLensPromptVersion,
  isWordLensCacheAlias
} from "@/lib/word-lens-cache";
import { getWordLensCacheCoordinates } from "@/lib/word-lens-data";

describe("Word Lens cache coordinates", () => {
  it("canonicalizes a reference without loading its target chapter", () => {
    expect(
      getWordLensCacheCoordinates({
        reference: "Jn 3:16-18",
        translation: "dbs:CaseSensitiveId"
      })
    ).toEqual({
      reference: "request:jn 3:16",
      sourceTranslation: "ugnt",
      targetTranslation: "dbs:CaseSensitiveId"
    });
  });

  it("uses the first verse and Hebrew source for an Old Testament chapter", () => {
    expect(
      getWordLensCacheCoordinates({
        reference: "Genesis 1",
        translation: "web"
      })
    ).toEqual({
      reference: "request:genesis 1:1",
      sourceTranslation: "uhb",
      targetTranslation: "web"
    });
  });

  it("rejects an invalid reference before cache lookup", () => {
    expect(
      getWordLensCacheCoordinates({
        reference: "not a passage",
        translation: "web"
      })
    ).toBeNull();
  });

  it("keeps ambiguous book input separate from any resolved canonical book", () => {
    expect(
      getWordLensCacheCoordinates({
        reference: "Corinthians 3:2",
        translation: "web"
      })?.reference
    ).toBe("request:corinthians 3:2");
    expect(
      getWordLensCacheCoordinates({
        reference: "1 Corinthians 3:2",
        translation: "web"
      })?.reference
    ).toBe("request:1corinthians 3:2");
  });
});

describe("Word Lens cache key", () => {
  it("preserves canonical DBS identifier casing", () => {
    const common = {
      kind: "full" as const,
      reference: "John 3:16",
      sourceTranslation: "ugnt",
      model: "test-model",
      promptVersion: getWordLensPromptVersion()
    };

    expect(
      buildWordLensCacheKey({
        ...common,
        targetTranslation: "dbs:CaseSensitiveId"
      })
    ).not.toBe(
      buildWordLensCacheKey({
        ...common,
        targetTranslation: "dbs:casesensitiveid"
      })
    );
  });

  it("recognizes only bounded canonical cache aliases", () => {
    const canonicalCacheKey = "a".repeat(64);
    expect(
      isWordLensCacheAlias({
        __wordLensCacheAlias: 1,
        canonicalCacheKey
      })
    ).toBe(true);
    expect(
      isWordLensCacheAlias({
        __wordLensCacheAlias: 1,
        canonicalCacheKey: "not-a-cache-key"
      })
    ).toBe(false);
    expect(
      isWordLensCacheAlias({
        __wordLensCacheAlias: 2,
        canonicalCacheKey
      })
    ).toBe(false);
  });
});
