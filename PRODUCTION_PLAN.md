# ShepherdStudy Production Plan

This file tracks the implementation sequence for productionization and serves as the living thread for execution status.

## Status Legend
- `TODO`: not started
- `IN_PROGRESS`: currently being implemented
- `DONE`: completed and validated

## Phase 1: Foundation Hardening
- `DONE` Add production security headers.
- `DONE` Add request ID middleware and centralized request logging baseline.
- `DONE` Tighten auth/session security defaults.
- `DONE` Move database from SQLite to managed Postgres.

### Phase 1 Notes
- Security headers, request ID propagation, and auth hardening are implemented first because they are low-risk and immediately improve safety.
- Postgres cutover completed: Neon migration deployed, RBAC applied, and Bible data imported.

## Phase 2: Quotas and Rate Limits
- `DONE` Create quota model (`DailyQuotaUsage`) with `(actorKey, feature, day)` uniqueness.
- `DONE` Enforce per-user/day limit before expensive model calls.
- `DONE` Add burst limit (per-minute) guard.
- `DONE` Return structured 429 payloads with reset info.

## Phase 3: Study History Persistence
- `DONE` Add `StudyThread` / `StudyMessage` models.
- `DONE` Add thread list/get/create/append/archive APIs.
- `DONE` Persist recommendations + translation metadata per assistant turn.
- `DONE` Add study sidebar history UI and resume flow.

## Phase 4: WWJD History Persistence
- `DONE` Add `WwjdThread` / `WwjdMessage` models.
- `DONE` Add list/get/create/append/archive APIs.
- `DONE` Add WWJD sidebar history UI and resume flow.

## Phase 5: Observability and Reliability
- `DONE` Add structured logs and request correlation in APIs.
- `DONE` Add Sentry or equivalent error tracking.
- `DONE` Add health check endpoint.
- `DONE` Add backup/restore checklist for Postgres.

## Phase 6: QA Gate
- `DONE` Unit tests for quota logic + study response transforms.
- `DONE` Integration tests for thread persistence and retrieval.
- `DONE` E2E smoke tests for `/study` and `/wwjd`.

## Phase 7: Launch
- `IN_PROGRESS` Configure production domain and HTTPS (hosting/DNS action required).
- `DONE` Add privacy/terms pages.
- `DONE` Add analytics and retention monitoring.
