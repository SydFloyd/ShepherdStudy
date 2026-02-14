-- CreateEnum
CREATE TYPE "QuotaFeature" AS ENUM ('STUDY', 'WWJD');

-- CreateTable
CREATE TABLE "DailyQuotaUsage" (
    "id" TEXT NOT NULL,
    "actorKey" TEXT NOT NULL,
    "userId" TEXT,
    "feature" "QuotaFeature" NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyQuotaUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyQuotaUsage_userId_day_idx" ON "DailyQuotaUsage"("userId", "day");

-- CreateIndex
CREATE INDEX "DailyQuotaUsage_feature_day_idx" ON "DailyQuotaUsage"("feature", "day");

-- CreateIndex
CREATE UNIQUE INDEX "DailyQuotaUsage_actorKey_feature_day_key" ON "DailyQuotaUsage"("actorKey", "feature", "day");

-- AddForeignKey
ALTER TABLE "DailyQuotaUsage" ADD CONSTRAINT "DailyQuotaUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;