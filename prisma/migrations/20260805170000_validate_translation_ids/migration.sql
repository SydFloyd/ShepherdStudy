-- Keep the database permissive enough for dynamic DBS editions while still
-- rejecting malformed or unnamespaced translation identifiers.
ALTER TABLE "User"
ADD CONSTRAINT "User_preferredTranslation_check"
CHECK (
  "preferredTranslation" IN ('web', 'kjv', 'asv', 'uhb', 'ugnt')
  OR "preferredTranslation" ~ '^dbs:[A-Za-z0-9_-]{2,48}$'
);

ALTER TABLE "MemorizationPassage"
ADD CONSTRAINT "MemorizationPassage_translation_check"
CHECK (
  "translation" IN ('web', 'kjv', 'asv', 'uhb', 'ugnt')
  OR "translation" ~ '^dbs:[A-Za-z0-9_-]{2,48}$'
);

ALTER TABLE "MemorizationRecommendationCache"
ADD CONSTRAINT "MemorizationRecommendationCache_translation_check"
CHECK (
  "translation" IN ('web', 'kjv', 'asv', 'uhb', 'ugnt')
  OR "translation" ~ '^dbs:[A-Za-z0-9_-]{2,48}$'
);
