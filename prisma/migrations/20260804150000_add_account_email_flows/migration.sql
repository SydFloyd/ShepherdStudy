-- Existing accounts predate verification, so preserve their access while requiring
-- verification for every account created after this migration.
ALTER TABLE "User"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

UPDATE "User"
SET "emailVerifiedAt" = CURRENT_TIMESTAMP;

CREATE TYPE "AccountTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

CREATE TABLE "AccountToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "purpose" "AccountTokenPurpose" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");
CREATE INDEX "AccountToken_userId_purpose_createdAt_idx" ON "AccountToken"("userId", "purpose", "createdAt");
CREATE INDEX "AccountToken_expiresAt_idx" ON "AccountToken"("expiresAt");

ALTER TABLE "AccountToken"
ADD CONSTRAINT "AccountToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
