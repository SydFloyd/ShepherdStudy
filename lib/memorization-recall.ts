export type RecallToken = {
  text: string;
  status: "correct" | "incorrect" | "missing";
};

export type RecallAssessment = {
  score: number;
  matchedWords: number;
  expectedWordCount: number;
  submittedWordCount: number;
  expected: RecallToken[];
  submitted: RecallToken[];
};

const MAX_WORDS_PER_SIDE = 5_000;
const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;

function tokenize(input: string) {
  return input.match(WORD_PATTERN) ?? [];
}

function normalizeToken(token: string) {
  return token
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/’/g, "'")
    .toLocaleLowerCase("en-US");
}

export function assessRecall(
  expectedText: string,
  submittedText: string
): RecallAssessment {
  const expectedWords = tokenize(expectedText);
  const submittedWords = tokenize(submittedText);

  if (
    expectedWords.length > MAX_WORDS_PER_SIDE ||
    submittedWords.length > MAX_WORDS_PER_SIDE
  ) {
    throw new RangeError("Recall text exceeds the supported word limit.");
  }

  const expectedNormalized = expectedWords.map(normalizeToken);
  const submittedNormalized = submittedWords.map(normalizeToken);
  const rows = expectedWords.length + 1;
  const columns = submittedWords.length + 1;
  const lcs = new Uint16Array(rows * columns);

  for (let expectedIndex = expectedWords.length - 1; expectedIndex >= 0; expectedIndex -= 1) {
    const rowOffset = expectedIndex * columns;
    const nextRowOffset = (expectedIndex + 1) * columns;
    for (
      let submittedIndex = submittedWords.length - 1;
      submittedIndex >= 0;
      submittedIndex -= 1
    ) {
      const cell = rowOffset + submittedIndex;
      if (expectedNormalized[expectedIndex] === submittedNormalized[submittedIndex]) {
        lcs[cell] = lcs[nextRowOffset + submittedIndex + 1] + 1;
      } else {
        lcs[cell] = Math.max(
          lcs[nextRowOffset + submittedIndex],
          lcs[rowOffset + submittedIndex + 1]
        );
      }
    }
  }

  const expected: RecallToken[] = [];
  const submitted: RecallToken[] = [];
  let expectedIndex = 0;
  let submittedIndex = 0;
  let matchedWords = 0;

  while (
    expectedIndex < expectedWords.length &&
    submittedIndex < submittedWords.length
  ) {
    if (expectedNormalized[expectedIndex] === submittedNormalized[submittedIndex]) {
      expected.push({ text: expectedWords[expectedIndex], status: "correct" });
      submitted.push({ text: submittedWords[submittedIndex], status: "correct" });
      matchedWords += 1;
      expectedIndex += 1;
      submittedIndex += 1;
      continue;
    }

    const skipExpected = lcs[(expectedIndex + 1) * columns + submittedIndex];
    const skipSubmitted = lcs[expectedIndex * columns + submittedIndex + 1];
    if (skipExpected >= skipSubmitted) {
      expected.push({ text: expectedWords[expectedIndex], status: "missing" });
      expectedIndex += 1;
    } else {
      submitted.push({
        text: submittedWords[submittedIndex],
        status: "incorrect"
      });
      submittedIndex += 1;
    }
  }

  while (expectedIndex < expectedWords.length) {
    expected.push({ text: expectedWords[expectedIndex], status: "missing" });
    expectedIndex += 1;
  }
  while (submittedIndex < submittedWords.length) {
    submitted.push({
      text: submittedWords[submittedIndex],
      status: "incorrect"
    });
    submittedIndex += 1;
  }

  const denominator = Math.max(expectedWords.length, submittedWords.length, 1);
  return {
    score: Math.round((matchedWords / denominator) * 100),
    matchedWords,
    expectedWordCount: expectedWords.length,
    submittedWordCount: submittedWords.length,
    expected,
    submitted
  };
}

export const __testables = {
  MAX_WORDS_PER_SIDE,
  normalizeToken,
  tokenize
};
