-- Store a preferred English translation for memorization and future settings use.
ALTER TABLE "User"
ADD COLUMN "preferredTranslation" TEXT NOT NULL DEFAULT 'web';

ALTER TABLE "User"
ADD CONSTRAINT "User_preferredTranslation_check"
CHECK ("preferredTranslation" IN ('web', 'kjv', 'asv'));

CREATE TYPE "MemorizationAttemptMode" AS ENUM ('TEXT', 'REFERENCE');

CREATE TABLE "MemorizationPassage" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "translation" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "book" TEXT NOT NULL,
  "bookOrder" INTEGER NOT NULL,
  "chapter" INTEGER NOT NULL,
  "verseStart" INTEGER NOT NULL,
  "verseEnd" INTEGER NOT NULL,
  "isWholeChapter" BOOLEAN NOT NULL DEFAULT false,
  "text" TEXT NOT NULL,
  "verses" JSONB NOT NULL,
  "textAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "latestTextScore" INTEGER,
  "bestTextScore" INTEGER,
  "referenceAttemptCount" INTEGER NOT NULL DEFAULT 0,
  "latestReferenceScore" INTEGER,
  "bestReferenceScore" INTEGER,
  "lastPracticedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemorizationPassage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MemorizationPassage_translation_check"
    CHECK ("translation" IN ('web', 'kjv', 'asv')),
  CONSTRAINT "MemorizationPassage_verse_range_check"
    CHECK ("chapter" > 0 AND "verseStart" > 0 AND "verseEnd" >= "verseStart"),
  CONSTRAINT "MemorizationPassage_attempt_count_check"
    CHECK ("textAttemptCount" >= 0 AND "referenceAttemptCount" >= 0),
  CONSTRAINT "MemorizationPassage_text_score_check"
    CHECK (
      ("latestTextScore" IS NULL OR "latestTextScore" BETWEEN 0 AND 100) AND
      ("bestTextScore" IS NULL OR "bestTextScore" BETWEEN 0 AND 100)
    ),
  CONSTRAINT "MemorizationPassage_reference_score_check"
    CHECK (
      ("latestReferenceScore" IS NULL OR "latestReferenceScore" BETWEEN 0 AND 100) AND
      ("bestReferenceScore" IS NULL OR "bestReferenceScore" BETWEEN 0 AND 100)
    )
);

CREATE TABLE "MemorizationAttempt" (
  "id" TEXT NOT NULL,
  "passageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "mode" "MemorizationAttemptMode" NOT NULL,
  "score" INTEGER NOT NULL,
  "wordCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemorizationAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MemorizationAttempt_score_check" CHECK ("score" BETWEEN 0 AND 100),
  CONSTRAINT "MemorizationAttempt_word_count_check" CHECK ("wordCount" >= 0)
);

CREATE TABLE "MemorizationRecommendationCache" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "translation" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MemorizationRecommendationCache_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MemorizationRecommendationCache_translation_check"
    CHECK ("translation" IN ('web', 'kjv', 'asv'))
);

CREATE UNIQUE INDEX "MemorizationPassage_userId_translation_bookOrder_chapter_verseStart_verseEnd_key"
ON "MemorizationPassage"("userId", "translation", "bookOrder", "chapter", "verseStart", "verseEnd");

CREATE INDEX "MemorizationPassage_userId_updatedAt_idx"
ON "MemorizationPassage"("userId", "updatedAt");

CREATE INDEX "MemorizationPassage_userId_bookOrder_chapter_verseStart_idx"
ON "MemorizationPassage"("userId", "bookOrder", "chapter", "verseStart");

CREATE INDEX "MemorizationAttempt_passageId_createdAt_idx"
ON "MemorizationAttempt"("passageId", "createdAt");

CREATE INDEX "MemorizationAttempt_userId_createdAt_idx"
ON "MemorizationAttempt"("userId", "createdAt");

CREATE UNIQUE INDEX "MemorizationRecommendationCache_userId_key"
ON "MemorizationRecommendationCache"("userId");

CREATE INDEX "MemorizationRecommendationCache_sourceFingerprint_idx"
ON "MemorizationRecommendationCache"("sourceFingerprint");

ALTER TABLE "MemorizationPassage"
ADD CONSTRAINT "MemorizationPassage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemorizationAttempt"
ADD CONSTRAINT "MemorizationAttempt_passageId_fkey"
FOREIGN KEY ("passageId") REFERENCES "MemorizationPassage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemorizationAttempt"
ADD CONSTRAINT "MemorizationAttempt_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MemorizationRecommendationCache"
ADD CONSTRAINT "MemorizationRecommendationCache_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
