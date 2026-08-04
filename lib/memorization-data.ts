import { createHash } from "node:crypto";

import { z } from "zod";

import {
  getBookOrderByName,
  MemorizationTranslationId,
  resolveBibleBookCandidates
} from "@/lib/bible";
import { resolvePassageFromLocalBible } from "@/lib/local-bible";
import { assessRecall, RecallAssessment } from "@/lib/memorization-recall";
import { parseScriptureReference } from "@/lib/scripture";

const MAX_PASSAGE_VERSES = 200;
const MAX_PASSAGE_TEXT_LENGTH = 50_000;

const verseSnapshotSchema = z.array(
  z.object({
    verse: z.number().int().positive(),
    text: z.string()
  })
);

export const recommendationPayloadSchema = z.array(
  z.object({
    reference: z.string().min(1).max(120),
    reason: z.string().min(1).max(240)
  })
);

export type MemorizationRecommendation = z.infer<
  typeof recommendationPayloadSchema
>[number];

export type ResolvedMemorizationPassage = {
  translation: MemorizationTranslationId;
  reference: string;
  book: string;
  bookOrder: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  isWholeChapter: boolean;
  text: string;
  verses: Array<{ verse: number; text: string }>;
};

export type MemorizationPassageCoordinates = Pick<
  ResolvedMemorizationPassage,
  "bookOrder" | "chapter" | "verseStart" | "verseEnd"
> & { translation: string };

type MemorizationPassageRecord = MemorizationPassageCoordinates & {
  id: string;
  reference: string;
  book: string;
  isWholeChapter: boolean;
  text: string;
  verses: unknown;
  textAttemptCount: number;
  latestTextScore: number | null;
  bestTextScore: number | null;
  referenceAttemptCount: number;
  latestReferenceScore: number | null;
  bestReferenceScore: number | null;
  lastPracticedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function formatReference(input: {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  isWholeChapter: boolean;
}) {
  if (input.isWholeChapter) {
    return `${input.book} ${input.chapter}`;
  }
  if (input.verseStart === input.verseEnd) {
    return `${input.book} ${input.chapter}:${input.verseStart}`;
  }
  return `${input.book} ${input.chapter}:${input.verseStart}-${input.verseEnd}`;
}

export async function resolveMemorizationPassage(input: {
  reference: string;
  translation: MemorizationTranslationId;
}): Promise<
  | { ok: true; passage: ResolvedMemorizationPassage }
  | { ok: false; message: string }
> {
  const parsed = parseScriptureReference(input.reference);
  if (!parsed) {
    return {
      ok: false,
      message:
        "Enter one verse, a contiguous range, or a whole chapter (for example, John 3:16, Romans 8:1-4, or Psalm 23)."
    };
  }

  const resolution = await resolvePassageFromLocalBible(input);
  if (!resolution.ok) {
    return { ok: false, message: resolution.message };
  }

  const selected = resolution.selectedVerses;
  if (selected.length === 0) {
    return { ok: false, message: "That passage does not exist in this translation." };
  }

  const isWholeChapter = parsed.verseStart === undefined;
  const verseStart = isWholeChapter
    ? selected[0].verse
    : parsed.verseStart ?? selected[0].verse;
  const verseEnd = isWholeChapter
    ? selected[selected.length - 1].verse
    : parsed.verseEnd ?? verseStart;

  if (
    selected[0].verse !== verseStart ||
    selected[selected.length - 1].verse !== verseEnd
  ) {
    return { ok: false, message: "One or more verses in that range do not exist." };
  }
  if (selected.length > MAX_PASSAGE_VERSES) {
    return {
      ok: false,
      message: `A memorization passage can contain at most ${MAX_PASSAGE_VERSES} verses.`
    };
  }

  const verses = selected.map((item) => ({
    verse: item.verse,
    text: item.text.trim()
  }));
  const text = verses.map((item) => item.text).join(" ").trim();
  if (!text || text.length > MAX_PASSAGE_TEXT_LENGTH) {
    return {
      ok: false,
      message: "That passage is too large to use as one memorization item."
    };
  }

  const bookOrder = getBookOrderByName(resolution.resolvedBook);
  if (!bookOrder) {
    return { ok: false, message: "Unable to resolve that Bible book." };
  }

  return {
    ok: true,
    passage: {
      translation: input.translation,
      reference: formatReference({
        book: resolution.resolvedBook,
        chapter: parsed.chapter,
        verseStart,
        verseEnd,
        isWholeChapter
      }),
      book: resolution.resolvedBook,
      bookOrder,
      chapter: parsed.chapter,
      verseStart,
      verseEnd,
      isWholeChapter,
      text,
      verses
    }
  };
}

export function parseVerseSnapshots(value: unknown) {
  return verseSnapshotSchema.parse(value);
}

export function serializeMemorizationPassage(
  passage: MemorizationPassageRecord
) {
  return {
    id: passage.id,
    translation: passage.translation,
    reference: passage.reference,
    book: passage.book,
    bookOrder: passage.bookOrder,
    chapter: passage.chapter,
    verseStart: passage.verseStart,
    verseEnd: passage.verseEnd,
    isWholeChapter: passage.isWholeChapter,
    text: passage.text,
    verses: parseVerseSnapshots(passage.verses),
    textAttemptCount: passage.textAttemptCount,
    latestTextScore: passage.latestTextScore,
    bestTextScore: passage.bestTextScore,
    referenceAttemptCount: passage.referenceAttemptCount,
    latestReferenceScore: passage.latestReferenceScore,
    bestReferenceScore: passage.bestReferenceScore,
    lastPracticedAt: passage.lastPracticedAt?.toISOString() ?? null,
    createdAt: passage.createdAt.toISOString(),
    updatedAt: passage.updatedAt.toISOString()
  };
}

export function passagesOverlap(
  left: MemorizationPassageCoordinates,
  right: MemorizationPassageCoordinates
) {
  return (
    left.translation === right.translation &&
    left.bookOrder === right.bookOrder &&
    left.chapter === right.chapter &&
    left.verseStart <= right.verseEnd &&
    right.verseStart <= left.verseEnd
  );
}

export function getMemorizationSetFingerprint(
  passages: MemorizationPassageCoordinates[]
) {
  const source = passages
    .map(
      (passage) =>
        `${passage.translation}:${passage.bookOrder}:${passage.chapter}:${passage.verseStart}:${passage.verseEnd}`
    )
    .sort()
    .join("|");
  return createHash("sha256").update(source).digest("hex");
}

function isSameResolvedBook(input: string, expectedBook: string) {
  return Array.from(new Set([input, ...resolveBibleBookCandidates(input)]))
    .some((book) => book.toLowerCase() === expectedBook.toLowerCase());
}

export function isExactPassageReference(
  passage: Pick<
    ResolvedMemorizationPassage,
    | "book"
    | "chapter"
    | "verseStart"
    | "verseEnd"
    | "isWholeChapter"
  >,
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
  passage: Pick<
    ResolvedMemorizationPassage,
    | "reference"
    | "book"
    | "chapter"
    | "verseStart"
    | "verseEnd"
    | "isWholeChapter"
  >,
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

export const __testables = {
  MAX_PASSAGE_TEXT_LENGTH,
  MAX_PASSAGE_VERSES,
  formatReference,
  isSameResolvedBook
};
