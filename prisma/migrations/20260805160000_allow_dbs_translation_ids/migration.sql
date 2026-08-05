-- Bible translation identifiers are validated against the local/DBS provider
-- catalog in application code. Remove the original three-version database
-- allowlists so namespaced DBS identifiers can be persisted without rewriting
-- the established local identifiers.
ALTER TABLE "User"
DROP CONSTRAINT IF EXISTS "User_preferredTranslation_check";

ALTER TABLE "MemorizationPassage"
DROP CONSTRAINT IF EXISTS "MemorizationPassage_translation_check";

ALTER TABLE "MemorizationRecommendationCache"
DROP CONSTRAINT IF EXISTS "MemorizationRecommendationCache_translation_check";

-- Preserve the edition metadata that accompanied the saved Scripture text.
-- Existing passages remain valid and infer their local source when this is null.
ALTER TABLE "MemorizationPassage"
ADD COLUMN "editionSnapshot" JSONB;
