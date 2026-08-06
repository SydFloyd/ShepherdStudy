ALTER TABLE "User"
ADD COLUMN "preferredLanguage" TEXT NOT NULL DEFAULT 'eng';

ALTER TABLE "User"
ADD CONSTRAINT "User_preferredLanguage_check"
CHECK (
  char_length("preferredLanguage") BETWEEN 2 AND 16
  AND "preferredLanguage" ~ '^[a-z0-9_-]+$'
);
