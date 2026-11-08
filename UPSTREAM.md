# Upstream

This repository is built on **openGym** by Duarte Santos — https://github.com/DuarteSantos8/openGym  
Imported at commit `8fb98b16861a2728652302a7e6e30c50548493a0` (shallow clone, 2026-11-08). openGym's code is **AGPL-3.0** (see `LICENSE`, `NOTICE.md`, `CLA.md`).

- Because this is a network service, anyone who uses a deployed copy must be able to get its source (AGPL §13). Keep this repository available to your users.
- The exercise media in `catalogue/media/` is **not** AGPL: Gym visual's terms apply. A **non-commercial** fork may keep the unmodified 180 px media with `NOTICE.md`. Don't hotlink it, copy it elsewhere, or feed it to any AI system.
- Our additions live in `addons/` and in clearly marked changes; `reference/spec-v1/` is the earlier standalone build (Drizzle schema, seed data, progression + cardio rules) kept as the source for porting.

## Start here
- **Host it:** [`deploy/README.md`](deploy/README.md) (a VPS with a persistent disk, one compose command, HTTPS).
- **Whoop:** [`docs/WHOOP.md`](docs/WHOOP.md) (setup, and what is and isn't verified yet).
- **Railway + Cloudflare (what we're doing):** [`deploy/RAILWAY.md`](deploy/RAILWAY.md).

## What this fork changes (so modifications are marked, as the AGPL asks)
- **Whoop integration**: `api/integrations/providers/whoop.js`, `whoop-service.js`, `whoop-data.js`; UI in `frontend/src/views/WhoopSheets.jsx`, `lib/whoop.js`. See `docs/WHOOP.md`.
- **Admin from the environment**: `ADMIN_NAME` + `ADMIN_PASSWORD` (`bootstrapEnvAdmin()` in `api/server.js`).
- **Manual gym check-in that counts towards the streak and shows on the calendar**: `frontend/src/lib/gym-visits.js`, the Home check-in card, `streak.js`, the calendar in `sheets.jsx`; synced like day notes (`gymVisits` in the stamped-map lists on both sides). The QR membership codes page is unchanged.
- **Hosting**: `deploy/` (Caddy, Railway), `web/10-resolver-auto.envsh`, and the `VOLUME` line removed from `api/Dockerfile` (Railway rejects it).
- `reference/spec-v1/` is an earlier standalone build kept for its seed data and rules.
