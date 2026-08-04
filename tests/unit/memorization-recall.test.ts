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
});
