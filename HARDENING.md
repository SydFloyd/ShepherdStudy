# Hardening, Cleanup, and Optimization Catalog

Last reviewed: August 4, 2026

## Completed in this pass

1. **Patched vulnerable dependencies (critical).** Updated the supported Next.js,
   NextAuth, Sentry, Prisma, adm-zip, ESLint, Playwright, and Vitest release lines.
   `npm audit` now reports zero known vulnerabilities, down from 27 including one
   critical advisory. The supported and CI runtime is Node.js 24 instead of the
   end-of-life Node.js 20 line, and CI actions are pinned to reviewed release SHAs.
2. **Bounded every API request body (high).** JSON routes now stream through a
   shared 256 KiB ceiling and reject oversized, malformed, invalid UTF-8, or
   dishonest `Content-Length` requests. Registration forms use a 16 KiB
   URL-encoded-only parser. This limits memory-amplification and parser abuse.
3. **Protected registration with Cloudflare Turnstile (high).** The registration
   form and JSON endpoint now require a single-use challenge before database or
   password-hashing work. Server verification fails closed on missing config,
   malformed tokens, network/HTTP/JSON failures, action mismatch, or hostname
   mismatch; the secret stays in server-only environment configuration.
4. **Made quota enforcement concurrency-safe and privacy-preserving (high).**
   Quota decisions run at serializable isolation with bounded conflict retries;
   invalid environment limits fall back safely; anonymous actor keys are HMACed
   (or hashed) instead of storing raw IP/user-agent material.
5. **Removed the WWJD feature end-to-end (high).** Deleted its UI, APIs, prompt
   code, persistence layer, tests, styles, configuration, metrics, and Prisma
   models. A forward migration drops the retired tables and enum values while
   historical migrations remain intact for reproducible databases.
6. **Hardened authentication and operational endpoints (high).** Login now
   normalizes email input, caps credential size, and performs a dummy bcrypt
   comparison for unknown accounts. Admin metric keys use constant-time digest
   comparison and all metric/health responses opt out of caching. Public health
   output no longer reveals secret/configuration presence or process uptime.
7. **Validated persisted response shapes (medium).** Authenticated history-write
   APIs reject arbitrary or deeply oversized client JSON and return 400 for
   validation failures instead of generic 500 responses.
8. **Reduced sensitive telemetry (medium).** Logger redaction covers prompts,
   queries, answers, replies, context, email, and user text. Usage tracking stores
   referrer paths without query strings.
9. **Improved hot-path and reporting efficiency (medium).** Multi-passage study
   lookups run concurrently, and retention reporting uses a grouped latest-event
   query instead of scanning a global message sample.
10. **Cleaned build and repository hygiene (medium).** Generated SQLite/test/build
   artifacts are ignored and no longer tracked; the Vitest config is unambiguously
   ESM; test globals are type-checked; CI now runs tests and a production dependency
   audit before building.
11. **Expanded browser hardening headers (medium).** Added cross-origin isolation,
    DNS prefetch, and legacy cross-domain policy protections to the existing frame,
    MIME sniffing, referrer, permissions, and HSTS headers.
12. **Added distributed authentication abuse controls (high).** PostgreSQL-backed
    expiring buckets cap completed Turnstile registrations and failed credential
    attempts across instances. Actor/account keys are HMAC pseudonyms, successful
    login clears only its actor/account pair, and rate decisions are serializable.
13. **Started observable CSP rollout (high).** A report-only policy inventories
    script, connection, frame, and inline requirements while explicitly allowing
    Turnstile and configured analytics/Sentry origins. Its bounded report endpoint
    removes URL queries, fragments, data payloads, and excess batch entries.
14. **Proved quota behavior under PostgreSQL contention (medium-high).** CI now
    starts PostgreSQL, applies the full migration history, and verifies concurrent
    quota and registration requests cannot exceed their configured ceilings.
15. **Reduced and maintained server surface (medium).** Removed the unconsumed
    client-side study-message append route. A bearer-authenticated daily Vercel
    cron deletes expired word-lens cache rows and authentication rate buckets.
16. **Bounded licensed ESV access (high).** Added one server-side Crossway API
    identity with conservative global request budgets, a 450-slot expiring cache,
    per-book and aggregate per-page ceilings below one half of a book, exact
    display attribution, and ESV-specific retry guidance. Compare, multi-passage
    study, long study threads, and memorization sets cannot combine individually
    valid excerpts into an oversized work. Memorization, study history, and Word
    Lens persist references and derived results instead of additional raw ESV
    copies.
17. **Resilient English translation defaults (medium).** New users and anonymous
    sessions start with DBS-provided NASB, while English pickers prioritize NASB,
    ESV, KJV, and WEB. The picker falls back to local WEB if the remote catalog
    cannot supply the default. Existing saved user preferences are preserved.

## Ranked next improvements

1. **Public-account trust lifecycle (highest value before broad sharing).** Add
   email verification, password reset, address-change confirmation, and session
   revocation without exposing whether an email is registered.
2. **Free/advanced entitlement and cost accounting (high value).** Model plan and
   entitlement state separately from usage meters. Define a useful free allowance,
   calculate advanced-tier cost from attributable infrastructure/AI usage, and
   make enforcement idempotent before adding a payment provider.
3. **Enforce CSP after observation (high value).** Review production violation
   telemetry, remove avoidable inline allowances, then graduate the report-only
   policy to a nonce- or hash-based enforced policy without forcing static pages
   into unnecessary dynamic rendering.
4. **Major-version modernization (medium value).** Plan React 19, Prisma 7, OpenAI
   SDK 7, Zod 4, bcryptjs 3, and TypeScript 7 as separate reviewed upgrades with
   behavior and migration tests. They were intentionally excluded from this
   security pass to avoid bundling unrelated breaking changes.
5. **Cache effectiveness metrics (medium value).** Track word-lens hit/miss/age
   without recording study text so prompt-version churn and avoidable AI cost are
   visible.
6. **Quiet donation path (product value, intentionally non-promotional).** Keep
   donations separate from plan entitlements and billing; expose only a low-key,
   user-initiated page once the payment foundation exists, with no nags or access
   advantages.
