CREATE TYPE "AccountTier" AS ENUM ('FREE', 'PAID');

ALTER TABLE "User"
ADD COLUMN "accountTier" "AccountTier" NOT NULL DEFAULT 'FREE';
