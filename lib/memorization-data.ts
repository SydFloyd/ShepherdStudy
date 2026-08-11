import { createHash } from "node:crypto";

import { z } from "zod";

import type { BibleSourceInfo } from "@/lib/bible";
import {
  getBookOrderByName,
  MemorizationTranslationId
} from "@/lib/bible";
import { BibleProviderError } from "@/lib/bible-provider-error";
import { resolvePassageFromBible } from "@/lib/bible-provider";
import { parseScriptureReference } from "@/lib/scripture";

export {
  assessReferenceRecall,
  isExactPassageReference
} from "@/lib/memorization-assessment";

const MAX_PASSAGE_VERSES = 200;
const MAX_PASSAGE_TEXT_LENGTH = 50_000;

const verseSnapshotSchema = z.array(
  z.object({
    verse: z.number().int().positive(),
    text: z.string()
  })
);

export const memorizationEditionSnapshotSchema = z
  .object({
    translation: z.string().trim().min(1).max(64),
    provider: z.enum(["local", "dbs", "esv"]),
    providerId: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(500),
    vernacularTitle: z.string().trim().max(500).nullable(),
    languageName: z.string().trim().min(1).max(200),
    languageIso: z.string().trim().min(1).max(12),
    script: z.string().trim().min(1).max(12),
    direction: z.enum(["ltr", "rtl"]),
    year: z.number().int().min(0).max(3000).nullable(),
    copyright: z.string().max(2_000).nullable()
  })
  .strict();

export type MemorizationEditionSnapshot = BibleSourceInfo &
  z.infer<typeof memorizationEditionSnapshotSchema> & {
    [key: string]: string | number | null;
  };

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
  editionSnapshot: MemorizationEditionSnapshot;
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
  editionSnapshot: unknown | null;
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

export function toMemorizationStorageData(
  passage: ResolvedMemorizationPassage
): ResolvedMemorizationPassage {
  if (passage.editionSnapshot.provider !== "esv") {
    return passage;
  }
  return {
    ...passage,
    text: "",
    verses: []
  };
}

export async function hydrateMemorizationPassage<
  T extends MemorizationPassageRecord
>(passage: T): Promise<T> {
  if (passage.translation !== "esv") {
    return passage;
  }
  const resolution = await resolveMemorizationPassage({
    reference: passage.reference,
    translation: passage.translation
  });
  if (!resolution.ok) {
    throw new BibleProviderError(
      resolution.message,
      "esv",
      "not_found",
      404
    );
  }
  return {
    ...passage,
    text: resolution.passage.text,
    verses: resolution.passage.verses,
    editionSnapshot: resolution.passage.editionSnapshot
  };
}

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

  const resolution = await resolvePassageFromBible(input);
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

  const editionSnapshot = memorizationEditionSnapshotSchema.parse(
    resolution.source
  ) as MemorizationEditionSnapshot;

  return {
    ok: true,
    passage: {
      translation: editionSnapshot.translation,
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
      verses,
      editionSnapshot
    }
  };
}

export function parseVerseSnapshots(value: unknown) {
  return verseSnapshotSchema.parse(value);
}

export function parseMemorizationEditionSnapshot(
  value: unknown
): MemorizationEditionSnapshot | null {
  const parsed = memorizationEditionSnapshotSchema.safeParse(value);
  return parsed.success
    ? (parsed.data as MemorizationEditionSnapshot)
    : null;
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
    editionSnapshot: parseMemorizationEditionSnapshot(
      passage.editionSnapshot
    ),
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

export const __testables = {
  MAX_PASSAGE_TEXT_LENGTH,
  MAX_PASSAGE_VERSES,
  formatReference
};
