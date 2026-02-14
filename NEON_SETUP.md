# Neon Setup and RBAC

This project is prepared for PostgreSQL with Prisma.

## 1) Set connection strings

Use Neon connection strings in your environment:

```env
# Runtime (pooled, -pooler host)
DATABASE_URL="postgresql://APP_USER:APP_PASSWORD@<project>-pooler.<region>.aws.neon.tech/<db>?sslmode=require&channel_binding=require"

# Migrations (direct, non-pooler host)
DIRECT_URL="postgresql://MIGRATOR_USER:MIGRATOR_PASSWORD@<project>.<region>.aws.neon.tech/<db>?sslmode=require&channel_binding=require"
```

## 2) Apply schema on Neon (no data migration)

```bash
npm run db:migrate:deploy
npm run db:generate
```

## 3) Recommended RBAC model

Use two database roles:
- `migrator`: schema change privileges, used only by Prisma migrations (`DIRECT_URL`)
- `app_user`: runtime read/write role used by the app (`DATABASE_URL`)

### Example SQL (run as Neon owner/admin)

```sql
-- Create roles
CREATE ROLE migrator LOGIN PASSWORD 'replace-migrator-password';
CREATE ROLE app_user LOGIN PASSWORD 'replace-app-password';

-- Database access
GRANT CONNECT ON DATABASE neondb TO migrator, app_user;

-- Schema access for migrations
GRANT USAGE, CREATE ON SCHEMA public TO migrator;

-- Runtime permissions
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO app_user;
```

This repository includes two scripts:
- `ops/rbac.sql` (owner/admin run)
- `ops/rbac-default-privileges.sql` (run as `migrator`)

Run it with:

```bash
npm run db:rbac
npm run db:rbac:defaults
```

`db:rbac:defaults` resolves connection in this order:
1. `DIRECT_URL`

Validate grants with:

```bash
npm run db:rbac:check
```

## 4) Rotation and ops notes

- Rotate `APP_PASSWORD` on a fixed cadence.
- Keep `migrator` credentials out of runtime environments if migrations are run only in CI.
- Restrict migration execution to deployment pipeline only.
