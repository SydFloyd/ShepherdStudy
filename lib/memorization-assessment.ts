import { resolveBibleBookCandidates } from "@/lib/bible";
import { assessRecall, RecallAssessment } from "@/lib/memorization-recall";
import { parseScriptureReference } from "@/lib/scripture";

export type ReferenceRecallPassage = {
  reference: string;
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  isWholeChapter: boolean;
};

function isSameResolvedBook(input: string, expectedBook: string) {
  return Array.from(new Set([input, ...resolveBibleBookCandidates(input)]))
    .some((book) => book.toLowerCase() === expectedBook.toLowerCase());
}

export function isExactPassageReference(
  passage: Omit<ReferenceRecallPassage, "reference">,
  submittedReference: string
) {
  const parsed = parseScriptureReference(submittedReference);
  if (
    !parsed ||
    parsed.chapter !== passage.chapter ||
    !isSameResolvedBook(parsed.book, passage.book)
  ) {
    return false;
  }

  if (parsed.verseStart === undefined) {
    return passage.isWholeChapter;
  }

  return (
    parsed.verseStart === passage.verseStart &&
    (parsed.verseEnd ?? parsed.verseStart) === passage.verseEnd
  );
}

export function assessReferenceRecall(
  passage: ReferenceRecallPassage,
  submittedReference: string
): RecallAssessment {
  const assessment = assessRecall(passage.reference, submittedReference);
  if (!isExactPassageReference(passage, submittedReference)) {
    return assessment;
  }

  return {
    ...assessment,
    score: 100,
    matchedWords: assessment.expectedWordCount,
    expected: assessment.expected.map((token) => ({
      ...token,
      status: "correct" as const
    })),
    submitted: assessment.submitted.map((token) => ({
      ...token,
      status: "correct" as const
    }))
  };
}

export const __testables = { isSameResolvedBook };
