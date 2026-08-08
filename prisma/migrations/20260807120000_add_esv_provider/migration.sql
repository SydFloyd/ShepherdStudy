-- ESV text is kept only in this globally bounded, expiring cache. User-owned
-- records retain references and derived data rather than additional text copies.
CREATE TABLE "EsvVerseCache" (
  "id" TEXT NOT NULL,
  "book" TEXT NOT NULL,
  "bookOrder" INTEGER NOT NULL,
  "chapter" INTEGER NOT NULL,
  "verse" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EsvVerseCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EsvVerseCache_bookOrder_chapter_verse_key"
ON "EsvVerseCache"("bookOrder", "chapter", "verse");

CREATE INDEX "EsvVerseCache_expiresAt_idx" ON "EsvVerseCache"("expiresAt");
CREATE INDEX "EsvVerseCache_lastAccessedAt_idx" ON "EsvVerseCache"("lastAccessedAt");
CREATE INDEX "EsvVerseCache_bookOrder_lastAccessedAt_idx"
ON "EsvVerseCache"("bookOrder", "lastAccessedAt");

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_preferredTranslation_check";
ALTER TABLE "MemorizationPassage" DROP CONSTRAINT IF EXISTS "MemorizationPassage_translation_check";
ALTER TABLE "MemorizationRecommendationCache" DROP CONSTRAINT IF EXISTS "MemorizationRecommendationCache_translation_check";

ALTER TABLE "User"
ADD CONSTRAINT "User_preferredTranslation_check"
CHECK (
  "preferredTranslation" IN ('web', 'kjv', 'asv', 'uhb', 'ugnt', 'esv')
  OR "preferredTranslation" ~ '^dbs:[A-Za-z0-9_-]{2,48}$'
);

ALTER TABLE "MemorizationPassage"
ADD CONSTRAINT "MemorizationPassage_translation_check"
CHECK (
  "translation" IN ('web', 'kjv', 'asv', 'uhb', 'ugnt', 'esv')
  OR "translation" ~ '^dbs:[A-Za-z0-9_-]{2,48}$'
);

ALTER TABLE "MemorizationRecommendationCache"
ADD CONSTRAINT "MemorizationRecommendationCache_translation_check"
CHECK (
  "translation" IN ('web', 'kjv', 'asv', 'uhb', 'ugnt', 'esv')
  OR "translation" ~ '^dbs:[A-Za-z0-9_-]{2,48}$'
);

-- Defensive cleanup if ESV records were ever written before this migration.
UPDATE "MemorizationPassage"
SET "text" = '', "verses" = '[]'::jsonb
WHERE "translation" = 'esv';
