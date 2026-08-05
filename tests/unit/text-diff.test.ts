import { describe, expect, it } from "vitest";

import { buildSideBySideDiff } from "@/lib/text-diff";

describe("buildSideBySideDiff", () => {
  it("marks inserted and removed tokens by side", () => {
    const result = buildSideBySideDiff({
      leftText: "In the beginning was the Word",
      rightText: "In the beginning was Word"
    });

    expect(result.left.some((segment) => segment.type === "removed")).toBe(true);
    expect(result.right.some((segment) => segment.type === "added")).toBe(false);
  });

  it("preserves equal text and flags right-side additions", () => {
    const result = buildSideBySideDiff({
      leftText: "Grace and peace",
      rightText: "Grace and abundant peace"
    });

    expect(result.left.some((segment) => segment.type === "added")).toBe(false);
    expect(result.right.some((segment) => segment.type === "added")).toBe(true);
    expect(result.right.map((segment) => segment.text).join("")).toContain(
      "abundant"
    );
  });

  it("diffs punctuation independently from word tokens", () => {
    const result = buildSideBySideDiff({
      leftText: "the Word became flesh",
      rightText: "the Word became flesh,"
    });

    const removedOnLeft = result.left
      .filter((segment) => segment.type === "removed")
      .map((segment) => segment.text)
      .join("");
    const addedOnRight = result.right
      .filter((segment) => segment.type === "added")
      .map((segment) => segment.text)
      .join("");

    expect(removedOnLeft).toBe("");
    expect(addedOnRight).toBe(",");
    expect(result.left.map((segment) => segment.text).join("")).toContain("flesh");
    expect(result.right.map((segment) => segment.text).join("")).toContain("flesh");
  });

  it("finds localized changes in text that does not use spaces", () => {
    const result = buildSideBySideDiff({
      leftText: "上帝爱世上的人",
      rightText: "上帝深爱世上的人"
    });

    expect(result.left.some((segment) => segment.type === "same")).toBe(true);
    expect(result.right.some((segment) => segment.type === "added")).toBe(true);
    expect(
      result.right
        .filter((segment) => segment.type === "added")
        .map((segment) => segment.text)
        .join("")
    ).toContain("深");
  });
});
