-- CreateEnum
CREATE TYPE "UsageFeature" AS ENUM ('STUDY', 'COMPARE', 'WORD_LENS', 'WWJD');

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "feature" "UsageFeature" NOT NULL,
    "pagePath" TEXT NOT NULL,
    "apiRoute" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "sourcePath" TEXT,
    "sourceHost" TEXT,
    "userId" TEXT,
    "anonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UsageEvent_feature_createdAt_idx" ON "UsageEvent"("feature", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_pagePath_createdAt_idx" ON "UsageEvent"("pagePath", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_anonId_createdAt_idx" ON "UsageEvent"("anonId", "createdAt");

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
