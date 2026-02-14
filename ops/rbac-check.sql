-- RBAC verification report for ShepherdStudy
-- Run with an admin or sufficiently privileged role.

\echo '=== ROLE EXISTENCE ==='
SELECT rolname
FROM pg_roles
WHERE rolname IN ('migrator', 'app_user')
ORDER BY rolname;

\echo '=== SCHEMA PRIVILEGES (public) ==='
SELECT
  role_name AS grantee,
  has_schema_privilege(role_name, 'public', 'USAGE') AS usage,
  has_schema_privilege(role_name, 'public', 'CREATE') AS create_priv
FROM (VALUES ('migrator'), ('app_user')) AS roles(role_name)
ORDER BY grantee;

\echo '=== TABLE PRIVILEGES (public) ==='
SELECT
  table_grants.grantee,
  table_grants.table_name,
  string_agg(table_grants.privilege_type, ', ' ORDER BY table_grants.privilege_type) AS privileges
FROM information_schema.role_table_grants AS table_grants
WHERE table_grants.table_schema = 'public'
  AND table_grants.grantee IN ('migrator', 'app_user')
GROUP BY table_grants.grantee, table_grants.table_name
ORDER BY table_grants.grantee, table_grants.table_name;

\echo '=== SEQUENCE PRIVILEGES (public) ==='
SELECT
  sequence_grants.grantee,
  sequence_grants.object_name AS sequence_name,
  string_agg(sequence_grants.privilege_type, ', ' ORDER BY sequence_grants.privilege_type) AS privileges
FROM information_schema.role_usage_grants AS sequence_grants
WHERE sequence_grants.object_type = 'SEQUENCE'
  AND sequence_grants.object_schema = 'public'
  AND sequence_grants.grantee IN ('migrator', 'app_user')
GROUP BY sequence_grants.grantee, sequence_grants.object_name
ORDER BY sequence_grants.grantee, sequence_grants.object_name;
