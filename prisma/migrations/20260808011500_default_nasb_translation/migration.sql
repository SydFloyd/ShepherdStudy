-- Keep existing user preferences intact while making NASB the default for
-- newly created accounts.
ALTER TABLE "User"
ALTER COLUMN "preferredTranslation" SET DEFAULT 'dbs:ENGNASB';
