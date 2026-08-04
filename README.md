# ShepherdStudy

Bible study web application with personalized scripture recommendations using OpenAI.

## Mission Guardrails

Before any feature work, read `MISSION.md`.  
Its mission principles and non-negotiables are intended to remain unchanged.

## Stack

- Next.js (App Router, TypeScript)
- NextAuth (credentials auth)
- Prisma + PostgreSQL (Neon in production)
- OpenAI Node SDK

## Features

- Register/login with verified email + password
- One-time email verification and password recovery through Postmark
- Submit a passage and optional context
- Study mode accepts passage-only, prompt-only, or both
- AI-generated related references + practical applications
- Clickable references that open chapter view with highlighted verses
- Fuzzy/alias book matching (e.g. `corinthians`, `corinthans`)
- Translation selector in study and passage views
- Optional original-language versions: UHB (Hebrew OT), UGNT (Greek NT)
- Save study sessions for authenticated users
- Dashboard showing recent sessions

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

Set `NEXTAUTH_SECRET`, `OPENAI_API_KEY`, `TURNSTILE_SECRET`,
`TURNSTILE_HOSTNAMES`, `CRON_SECRET`, `POSTMARK_API_KEY`, and
`POSTMARK_FROM_EMAIL`. Set `STRIPE_SECRET_KEY` to accept optional contributions
through hosted Stripe Checkout; the publishable key is not used by this flow.
The Postmark sender must be a confirmed sender signature or use a verified
domain. Use `localhost,127.0.0.1` only for local development; production must
list only its public registration hostnames.

3. Generate Prisma client and migrate DB:

```bash
npx prisma generate
npm run db:migrate:deploy
npm run import:bibles
npm run import:usfm
npm run import:original
npm run import:lexicon
```

4. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## API endpoints

- `POST /api/register` (requires a `turnstileToken` from the registration widget)
- `POST /api/study`
- `POST /api/donations/checkout` (creates a hosted, one-time Stripe Checkout session)
- `GET|POST /api/auth/[...nextauth]`

## Self-hosted Bible data

- Chapter text is loaded from PostgreSQL (`BibleVerse` table).
- Import command downloads public-domain texts from eBible and loads:
  - `WEB` (default)
  - `KJV`
  - `ASV`
- `npm run import:original` downloads and imports:
  - `UHB` (Hebrew Old Testament)
  - `UGNT` (Greek New Testament)
- `npm run import:lexicon` downloads and imports:
  - OpenScriptures Strong's Hebrew dictionary
  - OpenScriptures Strong's Greek dictionary
- `npm run import:usfm` upgrades WEB/KJV/ASV imports to USFM-backed structure:
  - paragraph grouping
  - verse-level footnotes and cross-references
- Recommendation links open local route: `/passage/[book]/[chapter]?ref=...`
- Translation is preserved in links via `&translation=...`.
- Approximate or ambiguous book names are resolved using aliases/fuzzy matching.
- If a reference cannot be parsed, the app falls back to an external `bible-api.com` link.
- Testament compatibility is enforced for original-language versions:
  - `UHB` supports Old Testament books
  - `UGNT` supports New Testament books
- UHB/UGNT source attribution: unfoldingWord resources (CC BY-SA 4.0).

## Notes

- If not logged in, study responses are returned but not saved.
- OpenAI model defaults to `gpt-4.1-mini` and can be overridden via `OPENAI_MODEL`.
- Anonymous, free, and paid quota policies are separate. `OPENAI_PAID_MODEL`
  opts paid accounts into an evaluated higher-quality model; if omitted, paid
  accounts safely retain the standard model.
- `/study` modes:
  - `passage_only`: "Passage Companion" with default behavior "Context & Companion"
  - `prompt_only`: "Topical Discovery" with default behavior "Topical Scout" and optional anchor passage from recommendations
  - `passage_and_prompt`: "Passage-Anchored Inquiry" with default behavior "Triangulated Guidance"
