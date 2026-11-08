# GYM — personal health & training platform

Single-user, admin-only. **No signup route exists** (unknown paths 404). See the build spec order: this commit ships steps 1–5.

**Mobile choice: Option A** (Expo + Swift WidgetKit extension) — not started yet; the API already accepts `Authorization: Bearer` for it.

## Layout
`apps/web` Next.js 15 (Vercel) · `apps/api` Fastify (Render) · `packages/db` Drizzle schema, migrations, seed · `packages/types` zod schemas + progression engine · `packages/ui` tokens

## Local
```bash
cp .env.example .env        # fill DATABASE_URL, DIRECT_URL, AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
pnpm install
pnpm db:migrate && pnpm seed:admin && pnpm seed
pnpm dev                    # web :3000, api :4000
pnpm test                   # progression unit tests + API integration tests (needs DATABASE_URL)
```

## Deploy
- **Neon**: pooled URL → `DATABASE_URL`, direct URL → `DIRECT_URL`. Migrate/seed from your machine against `DIRECT_URL`.
- **Render**: `render.yaml` (API). Set `DATABASE_URL`, `AUTH_SECRET`.
- **Vercel**: root dir `apps/web`; set `API_URL` to the Render URL. The browser only talks to the web origin; `/api/*` is rewritten to the API (first-party cookies, no CORS).

## Progression rule
All target sets × reps at ≥ target load, no failed set → +5 kg leg press / +2.5 kg machines & cables / next dumbbell / assisted −5 kg. One increment per exercise per IST week; applied to every template row of that exercise.

## Assumptions to verify (not in the spec)
Dumbbell ladder = 2 kg steps · bread slice = 30 g · rest timer default 90 s · veg-swap pairings · cable lateral raise steps +2.5 kg · weights are kg, dates Asia/Kolkata.
