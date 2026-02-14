# Launch Guide

## 1) Domain and HTTPS
1. Choose host (Vercel recommended for fastest Next.js launch).
2. Add production domain in host dashboard.
3. Add DNS records at your registrar:
   - `A` / `CNAME` as instructed by host.
4. Wait for SSL certificate issuance (automatic on most hosts).
5. Set production env vars in hosting dashboard:
   - `DATABASE_URL`, `DIRECT_URL`
   - `NEXTAUTH_URL` (set to your HTTPS domain)
   - `NEXTAUTH_SECRET`
   - `OPENAI_API_KEY`, `OPENAI_MODEL`
   - `SENTRY_DSN`, optional `NEXT_PUBLIC_SENTRY_DSN`
   - `ADMIN_METRICS_KEY`

## 2) Privacy and Terms
- Pages are now available at:
  - `/privacy`
  - `/terms`
- Review text with your legal preferences before public launch.

## 3) Analytics and Retention
- Optional analytics script (privacy-friendly setup):
  - `NEXT_PUBLIC_ANALYTICS_SCRIPT_SRC`
  - `NEXT_PUBLIC_ANALYTICS_DOMAIN`
- Retention metrics endpoint:
  - `GET /api/metrics/retention`
  - Auth via header `x-admin-key: <ADMIN_METRICS_KEY>`

## 4) Launch Smoke Checklist
1. `GET /api/health` returns `ok: true`.
2. Register/login works.
3. `/study` can generate and save history.
4. `/wwjd` can generate and save history.
5. Sentry receives test issue.
6. `GET /api/metrics/retention` returns JSON for admin key.
