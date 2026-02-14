-- ShepherdStudy default privileges
-- Run as the migrator role (not owner/admin).
-- This grants app_user rights on future tables/sequences created by migrator.

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO app_user;

