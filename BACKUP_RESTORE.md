# Backup and Restore Runbook

This runbook covers the minimum operational routine for Neon-backed production.

## Backup Baseline
- Enable Neon point-in-time restore (PITR) for production branch.
- Keep schema migrations in git and deploy with `npx prisma migrate deploy`.
- Export logical backup weekly:
  - `pg_dump "$DIRECT_URL" --format=custom --file=backups/shepherd_$(Get-Date -Format yyyyMMdd_HHmm).dump`
- Encrypt and store backup artifacts outside Neon (for example S3 or encrypted drive).

## Restore Drill (Monthly)
1. Create a new temporary Neon branch from production at current timestamp.
2. Restore latest logical dump into that branch:
   - `pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$DIRECT_URL_TEMP" backups/<file>.dump`
3. Run validation queries:
   - `SELECT COUNT(*) FROM "User";`
   - `SELECT COUNT(*) FROM "StudyThread";`
   - `SELECT COUNT(*) FROM "BibleVerse";`
4. Run app smoke checks against temp branch:
   - `/api/health` returns `ok: true`
   - `/study` can load and persist a test turn.
5. Record drill date, duration, and issues in ops notes.

## Incident Restore Procedure
1. Determine target recovery timestamp.
2. In Neon Console, create a restore branch at that timestamp.
3. Validate with read-only checks.
4. Repoint `DATABASE_URL` and `DIRECT_URL` to restored branch.
5. Run:
   - `npx prisma migrate deploy`
   - `npm run db:rbac`
   - `npm run db:rbac:defaults`
6. Run `/api/health` and a full application smoke test.
7. Announce completion and monitor error rate for 30 minutes.

## Ownership
- Primary owner: application operator.
- Frequency:
  - Logical backup export: weekly.
  - Restore drill: monthly.
