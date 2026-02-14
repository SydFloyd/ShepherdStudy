-- ShepherdStudy RBAC bootstrap for Neon/Postgres
-- Run as database owner/admin (not as app_user or migrator).
-- Adjust passwords before first run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'migrator') THEN
    CREATE ROLE migrator LOGIN PASSWORD 'replace-migrator-password';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN PASSWORD 'replace-app-password';
  END IF;
END
$$;

-- Database-level access
SELECT format(
  'GRANT CONNECT ON DATABASE %I TO migrator, app_user',
  current_database()
)
\gexec

-- Schema access and migration capability
GRANT USAGE, CREATE ON SCHEMA public TO migrator;

-- Runtime app access (existing objects)
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_user;
