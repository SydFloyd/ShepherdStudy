import { applyParagraphTemplate } from "@/lib/remote-passage-formatting";

describe("remote passage formatting", () => {
  it("applies canonical paragraph boundaries without changing verse content", () => {
    expect(
      applyParagraphTemplate(
        [
          { verse: 1, paragraph: 1, text: "one" },
          { verse: 2, paragraph: 1, text: "two" },
          { verse: 3, paragraph: 1, text: "three" },
        ],
        [
          { verse: 1, paragraph: 4 },
          { verse: 2, paragraph: 4 },
          { verse: 3, paragraph: 5 },
        ],
      ),
    ).toEqual([
      { verse: 1, paragraph: 4, text: "one" },
      { verse: 2, paragraph: 4, text: "two" },
      { verse: 3, paragraph: 5, text: "three" },
    ]);
  });
});
