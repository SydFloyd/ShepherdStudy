import { assessRecall } from "@/lib/memorization-recall";

describe("memorization recall assessment", () => {
  it("ignores capitalization, punctuation, and apostrophe style", () => {
    const assessment = assessRecall(
      "For God so loved the world, that he gave his one and only Son.",
      "for god so loved the world that HE gave his one and only son"
    );

    expect(assessment.score).toBe(100);
    expect(assessment.expected.every((token) => token.status === "correct")).toBe(
      true
    );
    expect(
      assessment.submitted.every((token) => token.status === "correct")
    ).toBe(true);
  });

  it("marks omitted expected words as missing", () => {
    const assessment = assessRecall(
      "For God so loved the world",
      "For God loved world"
    );

    expect(assessment.score).toBe(67);
    expect(
      assessment.expected
        .filter((token) => token.status === "missing")
        .map((token) => token.text)
    ).toEqual(["so", "the"]);
  });

  it("marks extra submitted words incorrect and penalizes the score", () => {
    const assessment = assessRecall(
      "Trust in the Lord",
      "Trust fully in the Lord"
    );

    expect(assessment.score).toBe(80);
    expect(
      assessment.submitted
        .filter((token) => token.status === "incorrect")
        .map((token) => token.text)
    ).toEqual(["fully"]);
  });

  it("returns zero and all expected words missing for a blank answer", () => {
    const assessment = assessRecall("Jesus wept", "");

    expect(assessment.score).toBe(0);
    expect(assessment.submitted).toEqual([]);
    expect(assessment.expected).toEqual([
      { text: "Jesus", status: "missing" },
      { text: "wept", status: "missing" }
    ]);
  });

  it("segments Chinese text into words without requiring spaces", () => {
    const assessment = assessRecall(
      "\u4e0a\u5e1d\u7231\u4e16\u4e0a\u7684\u4eba",
      "\u4e0a\u5e1d\u4e16\u4e0a\u7684\u4eba",
      { languageIso: "cmn", script: "Hans" }
    );

    expect(assessment.score).toBe(80);
    expect(assessment.expectedWordCount).toBe(5);
    expect(
      assessment.expected
        .filter((token) => token.status === "missing")
        .map((token) => token.text)
    ).toEqual(["\u7231"]);
  });

  it("segments Thai text while preserving combining vowel and tone marks", () => {
    const assessment = assessRecall(
      "\u0e1e\u0e23\u0e30\u0e40\u0e08\u0e49\u0e32\u0e17\u0e23\u0e07\u0e23\u0e31\u0e01\u0e42\u0e25\u0e01",
      "\u0e1e\u0e23\u0e30\u0e40\u0e08\u0e49\u0e32\u0e23\u0e31\u0e01\u0e42\u0e25\u0e01",
      { languageIso: "tha", script: "Thai" }
    );

    expect(assessment.score).toBe(75);
    expect(assessment.expectedWordCount).toBe(4);
    expect(
      assessment.expected
        .filter((token) => token.status === "missing")
        .map((token) => token.text)
    ).toEqual(["\u0e17\u0e23\u0e07"]);
  });
});
