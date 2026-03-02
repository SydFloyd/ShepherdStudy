export type DiffSegment = {
  text: string;
  type: "same" | "added" | "removed";
};

export type LinkedDiffSegment = DiffSegment & {
  groupId: number;
};

type DiffOp =
  | { type: "same"; text: string }
  | { type: "added"; text: string }
  | { type: "removed"; text: string };

function tokenize(input: string) {
  return input
    .split(/(\s+|[\p{P}\p{S}]+)/u)
    .filter((token) => token.length > 0);
}

function buildDiffOps(left: string[], right: string[]): DiffOp[] {
  const m = left.length;
  const n = right.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0)
  );

  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (left[i] === right[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;

  while (i < m && j < n) {
    if (left[i] === right[j]) {
      ops.push({ type: "same", text: left[i] });
      i += 1;
      j += 1;
      continue;
    }

    if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "removed", text: left[i] });
      i += 1;
    } else {
      ops.push({ type: "added", text: right[j] });
      j += 1;
    }
  }

  while (i < m) {
    ops.push({ type: "removed", text: left[i] });
    i += 1;
  }

  while (j < n) {
    ops.push({ type: "added", text: right[j] });
    j += 1;
  }

  return ops;
}

function compactSegments(segments: DiffSegment[]) {
  const compacted: DiffSegment[] = [];
  for (const segment of segments) {
    const last = compacted[compacted.length - 1];
    if (last && last.type === segment.type) {
      last.text += segment.text;
    } else {
      compacted.push({ ...segment });
    }
  }
  return compacted;
}

function compactLinkedSegments(segments: LinkedDiffSegment[]) {
  const compacted: LinkedDiffSegment[] = [];
  for (const segment of segments) {
    const last = compacted[compacted.length - 1];
    if (
      last &&
      last.type === segment.type &&
      last.groupId === segment.groupId
    ) {
      last.text += segment.text;
    } else {
      compacted.push({ ...segment });
    }
  }
  return compacted;
}

export function buildLinkedSideBySideDiff(input: {
  leftText: string;
  rightText: string;
}): {
  left: LinkedDiffSegment[];
  right: LinkedDiffSegment[];
} {
  const leftTokens = tokenize(input.leftText);
  const rightTokens = tokenize(input.rightText);
  const ops = buildDiffOps(leftTokens, rightTokens);

  const leftSegments: LinkedDiffSegment[] = [];
  const rightSegments: LinkedDiffSegment[] = [];

  let groupId = 1;
  let index = 0;

  while (index < ops.length) {
    const op = ops[index];

    if (op.type === "same") {
      while (index < ops.length && ops[index].type === "same") {
        const sameOp = ops[index];
        leftSegments.push({ text: sameOp.text, type: "same", groupId });
        rightSegments.push({ text: sameOp.text, type: "same", groupId });
        index += 1;
      }
      groupId += 1;
      continue;
    }

    while (index < ops.length && ops[index].type !== "same") {
      const changeOp = ops[index];
      if (changeOp.type === "removed") {
        leftSegments.push({ text: changeOp.text, type: "removed", groupId });
      } else {
        rightSegments.push({ text: changeOp.text, type: "added", groupId });
      }
      index += 1;
    }
    groupId += 1;
  }

  return {
    left: compactLinkedSegments(leftSegments),
    right: compactLinkedSegments(rightSegments)
  };
}

export function buildSideBySideDiff(input: {
  leftText: string;
  rightText: string;
}): {
  left: DiffSegment[];
  right: DiffSegment[];
} {
  const linked = buildLinkedSideBySideDiff(input);
  return {
    left: compactSegments(
      linked.left.map((segment) => ({
        text: segment.text,
        type: segment.type
      }))
    ),
    right: compactSegments(
      linked.right.map((segment) => ({
        text: segment.text,
        type: segment.type
      }))
    )
  };
}
