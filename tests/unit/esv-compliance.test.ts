import { describe, expect, it } from "vitest";

import {
  EsvDisplayBudget,
  getEsvDisplayLimitViolation,
  toEsvDisplaySelection
} from "@/lib/esv-compliance";

describe("ESV aggregate display compliance", () => {
  it("rejects a combined work above the conservative global ceiling", () => {
    expect(
      getEsvDisplayLimitViolation({
        selections: [
          { bookOrder: 19, verseCount: 225 },
          { bookOrder: 23, verseCount: 226 }
        ],
        bookVerseCounts: new Map([
          [19, 2_461],
          [23, 1_292]
        ])
      })
    ).toBe("global");
  });

  it("keeps combined quotations below half of each book", () => {
    const bookVerseCounts = new Map([[65, 100]]);
    expect(
      getEsvDisplayLimitViolation({
        selections: [{ bookOrder: 65, verseCount: 45 }],
        bookVerseCounts
      })
    ).toBeNull();
    expect(
      getEsvDisplayLimitViolation({
        selections: [
          { bookOrder: 65, verseCount: 30 },
          { bookOrder: 65, verseCount: 16 }
        ],
        bookVerseCounts
      })
    ).toBe("book");
  });

  it("reserves repeated ESV quotations as separate display usage", async () => {
    const budget = new EsvDisplayBudget(async () => 100);
    expect(
      await budget.reserve({ bookOrder: 65, verseCount: 30 })
    ).toBe(true);
    expect(
      await budget.reserve({ bookOrder: 65, verseCount: 16 })
    ).toBe(false);
  });

  it("creates selections only for displayed ESV verses", () => {
    const passage = {
      translation: "esv",
      reference: "John 3:16-17",
      verses: [{ verse: 16 }, { verse: 17 }]
    };
    expect(toEsvDisplaySelection(passage)).toEqual({
      bookOrder: 43,
      verseCount: 2
    });
    expect(
      toEsvDisplaySelection({ ...passage, translation: "web" })
    ).toBeNull();
  });
});
