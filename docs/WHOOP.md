# Whoop (this fork's addition)

openGym has no Whoop integration upstream. This fork adds one: your **own server** signs in to
Whoop for you (OAuth 2.0), pulls your data every 30 minutes and keeps it in `data/whoop/`. Nothing
goes through anyone else's server. Settings → Integrations → **Whoop**.

## What you get
- **Recovery** (score, HRV, resting heart rate, SpO2, skin temp) and the **guidance band**:
  67+ green "push for a PR", 34-66 yellow "hit targets, don't force new weight", 33 and under red.
- **Sleep** (time asleep, stages, efficiency, consistency, sleep debt) and **day strain**.
- **Steps**, from Whoop's own `step_count` on the cycle. If Whoop doesn't send it for your device it
  shows a dash. It is never filled in with a guess or a 0.
- **Workouts** with zone minutes. **Zone 4-5 weekly budget**: target 20-25 min, flagged above 30.
- **Heart-rate ceiling**: any workout over **175 bpm** in the last 14 days is flagged.
- A Whoop card on Home, once connected.

## Set it up
1. Create an app at <https://developer-dashboard.whoop.com> (needs your Whoop login).
2. Redirect URL: `https://YOUR-DOMAIN/api/integrations/oauth/callback` (https, exact match).
3. Scopes: `offline`, `read:recovery`, `read:cycles`, `read:sleep`, `read:workout`, `read:profile`,
   `read:body_measurement`. The app requests them itself; they need to be allowed on the Whoop app.
4. In `.env`: `INTEGRATIONS=webhook,whoop`, `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`,
   `WHOOP_REDIRECT_URI`. Then `docker compose up -d`.
5. In the app: Settings → Integrations → Whoop → **Connect**, approve on Whoop's page.

Whoop may hold a new app in a limited mode until it is reviewed. If sign-in works only for your own
account, that is fine for a personal instance.

## How it stays connected
Whoop **rotates the refresh token on every refresh** and the old one stops working; two refreshes at
once make the second fail. So refreshes are serialised, the new token is saved (sealed, AES-256-GCM,
key from `data/secret`) before anything else happens, and if the disk write fails the new token is
held in memory and retried. If Whoop refuses the grant (revoked, secret changed) the card says
**Needs attention** and sync stops until you tap **Connect again**. Disconnecting tells Whoop to end
the grant and deletes what was pulled.

⚠ Changing `data/secret` makes every sealed token unreadable: you connect again.

## What is verified and what isn't
Checked against the live Whoop docs (2026-11-08): authorize/token URLs, scopes, the `offline`
requirement, rotating refresh tokens, v2 paths, pagination, rate limits (100/min, 10 000/day), the
response fields. 22 automated tests run against a fake Whoop.

**Not verified against a real account** (nobody had credentials when this was written): that the
token endpoint accepts the client id/secret in the form body as the docs' sample shows, that Whoop
accepts the app's redirect URL, and that `step_count` is present for every device. The first real
connection is the test. If it fails, the card's activity log and the API log say why.

## Also
No Whoop webhooks yet (v2 webhooks exist; polling every 30 min is enough to start). Data is per
profile and lives only on your server, so the phone apps in standalone mode don't have it.
