-- Remove the retired WWJD feature and its stored data.
DROP TABLE IF EXISTS "WwjdMessage";
DROP TABLE IF EXISTS "WwjdThread";

DELETE FROM "DailyQuotaUsage" WHERE "feature" = 'WWJD';
DELETE FROM "UsageEvent" WHERE "feature" = 'WWJD';

-- PostgreSQL cannot remove enum values in place, so rebuild both feature enums.
CREATE TYPE "QuotaFeature_new" AS ENUM ('STUDY', 'INTERLINEAR');
ALTER TABLE "DailyQuotaUsage"
  ALTER COLUMN "feature" TYPE "QuotaFeature_new"
  USING ("feature"::text::"QuotaFeature_new");
DROP TYPE "QuotaFeature";
ALTER TYPE "QuotaFeature_new" RENAME TO "QuotaFeature";

CREATE TYPE "UsageFeature_new" AS ENUM ('STUDY', 'COMPARE', 'WORD_LENS');
ALTER TABLE "UsageEvent"
  ALTER COLUMN "feature" TYPE "UsageFeature_new"
  USING ("feature"::text::"UsageFeature_new");
DROP TYPE "UsageFeature";
ALTER TYPE "UsageFeature_new" RENAME TO "UsageFeature";
