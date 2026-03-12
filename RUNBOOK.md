# ShepherdStudy Runbook

## Purpose
Quick operational reference for local development, deploys, and production checks.

## Required Environment Variables
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (default: `gpt-4.1-mini`)
- `STUDY_DAILY_LIMIT`
- `WWJD_DAILY_LIMIT`
- `INTERLINEAR_DAILY_LIMIT`
- `STUDY_BURST_PER_MINUTE`
- `WWJD_BURST_PER_MINUTE`
- `INTERLINEAR_BURST_PER_MINUTE`
- `NEXT_PUBLIC_STUDY_HISTORY_RECENT_TURNS`
- `WORD_LENS_CACHE_TTL_HOURS`
- `ADMIN_METRICS_KEY`

Optional/observability:
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_TRACES_SAMPLE_RATE`
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`
- `NEXT_PUBLIC_ANALYTICS_SCRIPT_SRC`
- `NEXT_PUBLIC_ANALYTICS_DOMAIN`

Database admin/migrations:
- `DIRECT_URL`

## Local Commands
- Install deps: `npm install`
- Start dev server: `npm run dev`
- Build check: `npm run build`
- Unit + integration tests: `npm test`
- E2E tests: `npm run test:e2e`
- Import lexicon dictionaries: `npm run import:lexicon`

## Database Operations
- Generate client: `npm run db:generate`
- Apply migrations (prod-style): `npm run db:migrate:deploy`
- Create local migration: `npm run prisma:migrate`
- RBAC apply/check:
  - `npm run db:rbac`
  - `npm run db:rbac:defaults`
  - `npm run db:rbac:check`

## Deploy Flow
1. Merge/push to `main`.
2. Confirm Vercel deployment succeeds.
3. Run production smoke checks:
   - Register + login.
   - Study (prompt-only, verse-only, prompt+verse).
   - Recommendation preview and continue flow.
   - Interlinear load and version switching.
   - ShepherdAI chat and verse preview.
4. Check logs/monitoring:
   - Vercel runtime logs.
   - Sentry issues.
   - Retention metrics endpoint (admin key required):
     - `GET /api/metrics/retention` with header `x-admin-key`.
   - Usage metrics endpoint (admin key required):
     - `GET /api/metrics/usage` with header `x-admin-key`.

## Critical Endpoints
- Health: `GET /api/health`
- Study: `POST /api/study`
- ShepherdAI: `POST /api/wwjd`
- Interlinear: `POST /api/word-lens`
- Passage preview: `POST /api/passage-preview`
- Retention metrics: `GET /api/metrics/retention`
- Usage metrics: `GET /api/metrics/usage`

## Known Constraints
- Anonymous users are quota-limited by actor key derived from IP + user agent.
- Favicon/icon caching can be sticky in browsers; use hard refresh after brand updates.
- Interlinear uses one-verse focus; multi-verse input defaults to first verse.
- Interlinear deterministic fallback now depends on `BibleLexicon` data (`npm run import:lexicon`).
