# Hardening, Cleanup, and Optimization Catalog

Last reviewed: August 4, 2026

## Completed in this pass

1. **Patched vulnerable dependencies (critical).** Updated the supported Next.js,
   NextAuth, Sentry, Prisma, adm-zip, ESLint, Playwright, and Vitest release lines.
   `npm audit` now reports zero known vulnerabilities, down from 27 including one
   critical advisory.
2. **Bounded every API request body (high).** JSON routes now stream through a
   shared 256 KiB ceiling and reject oversized, malformed, invalid UTF-8, or
   dishonest `Content-Length` requests. Registration forms use a 16 KiB
   URL-encoded-only parser. This limits memory-amplification and parser abuse.
3. **Made quota enforcement concurrency-safe and privacy-preserving (high).**
   Quota decisions run at serializable isolation with bounded conflict retries;
   invalid environment limits fall back safely; anonymous actor keys are HMACed
   (or hashed) instead of storing raw IP/user-agent material.
4. **Removed the WWJD feature end-to-end (high).** Deleted its UI, APIs, prompt
   code, persistence layer, tests, styles, configuration, metrics, and Prisma
   models. A forward migration drops the retired tables and enum values while
   historical migrations remain intact for reproducible databases.
5. **Hardened authentication and operational endpoints (high).** Login now
   normalizes email input, caps credential size, and performs a dummy bcrypt
   comparison for unknown accounts. Admin metric keys use constant-time digest
   comparison and all metric/health responses opt out of caching. Public health
   output no longer reveals secret/configuration presence or process uptime.
6. **Validated persisted response shapes (medium).** Authenticated history-write
   APIs reject arbitrary or deeply oversized client JSON and return 400 for
   validation failures instead of generic 500 responses.
7. **Reduced sensitive telemetry (medium).** Logger redaction covers prompts,
   queries, answers, replies, context, email, and user text. Usage tracking stores
   referrer paths without query strings.
8. **Improved hot-path and reporting efficiency (medium).** Multi-passage study
   lookups run concurrently, and retention reporting uses a grouped latest-event
   query instead of scanning a global message sample.
9. **Cleaned build and repository hygiene (medium).** Generated SQLite/test/build
   artifacts are ignored and no longer tracked; the Vitest config is unambiguously
   ESM; test globals are type-checked; CI now runs tests and a production dependency
   audit before building.
10. **Expanded browser hardening headers (medium).** Added cross-origin isolation,
    DNS prefetch, and legacy cross-domain policy protections to the existing frame,
    MIME sniffing, referrer, permissions, and HSTS headers.

## Ranked next improvements

1. **Distributed registration and login abuse controls (high value).** Add a
   dedicated datastore-backed limiter for account creation and failed credential
   attempts, keyed by pseudonymous network actor plus normalized account. Consider
   Turnstile only after measuring abuse; do not rely on process-local counters.
2. **Content Security Policy rollout (high value).** Start with report-only mode,
   inventory the configurable analytics and Sentry destinations, eliminate inline
   exceptions, then enforce a nonce- or hash-based policy.
3. **Quota concurrency integration test (medium-high value).** Exercise parallel
   requests against ephemeral PostgreSQL in CI and assert the daily/burst ceilings
   cannot be exceeded under transaction contention.
4. **Retire the unused client-side study-message append endpoint (medium value).**
   The current UI persists turns through `/api/study`; after confirming no external
   client depends on the append endpoint, delete it to reduce surface area.
5. **Major-version modernization (medium value).** Plan React 19, Prisma 7, OpenAI
   SDK 7, Zod 4, bcryptjs 3, and TypeScript 7 as separate reviewed upgrades with
   behavior and migration tests. They were intentionally excluded from this
   security pass to avoid bundling unrelated breaking changes.
6. **Cache lifecycle maintenance (medium value).** Add a scheduled deletion job for
   expired `WordLensCache` rows and track hit/miss/age metrics so cache growth and
   prompt-version churn remain visible.
