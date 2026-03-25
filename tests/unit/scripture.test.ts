import {
  extractScriptureReferencesFromText,
  hasMeaningfulPromptText
} from "@/lib/scripture";

describe("scripture extraction", () => {
  it("extracts a single verse reference", () => {
    const result = extractScriptureReferencesFromText("John 3:16");

    expect(result.references).toEqual(["John 3:16"]);
    expect(result.residualText).toBe("");
  });

  it("extracts multiple references from a question prompt", () => {
    const result = extractScriptureReferencesFromText(
      "How does John 3:16 connect with Romans 5:8?"
    );

    expect(result.references).toEqual(["John 3:16", "Romans 5:8"]);
    expect(result.residualText).toContain("How does");
    expect(result.residualText).toContain("connect");
  });

  it("extracts same-book continuation references", () => {
    const result = extractScriptureReferencesFromText(
      "Read John 3:16, 18; 4:1-2 and 1 Peter 2:9."
    );

    expect(result.references).toEqual([
      "John 3:16",
      "John 3:18",
      "John 4:1-2",
      "1 Peter 2:9"
    ]);
  });

  it("extracts same-book chapter continuations", () => {
    const result = extractScriptureReferencesFromText("Study Psalms 23, 27 and 91");

    expect(result.references).toEqual(["Psalms 23", "Psalms 27", "Psalms 91"]);
    expect(result.residualText).toBe("Study");
  });

  it("treats connector-only residual text as non-prompt", () => {
    const result = extractScriptureReferencesFromText("John 3:16 and Romans 8:1");
    expect(result.references).toEqual(["John 3:16", "Romans 8:1"]);
    expect(hasMeaningfulPromptText(result.residualText)).toBe(false);
  });
});
