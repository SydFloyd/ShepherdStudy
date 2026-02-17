-- CreateTable
CREATE TABLE "WordLensCache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "sourceTranslation" TEXT NOT NULL,
    "targetTranslation" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WordLensCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WordLensCache_cacheKey_key" ON "WordLensCache"("cacheKey");

-- CreateIndex
CREATE INDEX "WordLensCache_kind_expiresAt_idx" ON "WordLensCache"("kind", "expiresAt");
