# Hosting this on your own server

⚠ **Pick a host with a disk that stays.** Everything lives in `./data`: your account and passkeys,
every workout, the sealed Whoop tokens. Free "web service" tiers (Render free, Heroku-style) wipe
the disk on every restart or deploy: you would lose it all. Use a small VPS (any $4-6/month Linux box
with Docker), or a host with a persistent volume.

Passkeys, the secure session cookie and Whoop's redirect all need **HTTPS on a real domain**, which
is what `docker-compose.https.yml` sets up.

## 1. One-time
1. A Linux VPS with Docker + Compose v2, and a domain. Add an **A record**: `gym.example.com` → the VPS IP.
2. Open ports **80 and 443** (80 is only for the certificate).
3. ```bash
   git clone https://github.com/Madhav-Sai/GYM.git && cd GYM
   git checkout claude/pensive-tesla-tl5xxk
   cp .env.example .env
   ```
4. Edit `.env` (the lines at the top are the local defaults: replace them):
   ```
   DOMAIN=gym.example.com
   RP_ID=gym.example.com
   ORIGIN=https://gym.example.com
   FIRST_USER_ADMIN=1
   ```
   `RP_ID` must be exactly the hostname: passkeys are bound to it.

## 2. Start
```bash
docker compose -f docker-compose.yml -f deploy/docker-compose.https.yml up -d --build
```
The first build takes a few minutes (it builds the app and bundles the exercise media).
Check: `docker compose ps` (all healthy) and `curl https://gym.example.com/api/health`
→ `{"ok":true,...}`.

## 3. First visit
Open `https://gym.example.com` and **create your profile first** (a passkey). With
`FIRST_USER_ADMIN=1` the first profile becomes the admin. Then lock the door by adding to `.env`
and re-running the same `up -d`:
```
INVITE_ONLY=1
ALLOW_GUEST=0
```

## 4. Whoop
Follow [docs/WHOOP.md](../docs/WHOOP.md), then `docker compose ... up -d` again.

## 5. Backups and updates
```bash
tar czf gym-backup-$(date +%F).tar.gz data/        # the whole state; keep copies off the server
git pull && docker compose -f docker-compose.yml -f deploy/docker-compose.https.yml up -d --build
```

## Known limits
- Behind Caddy the app sees Caddy's address as the client, so the sign-in throttle counts everyone
  together. Fine for one person or a few; see docs/SELF_HOSTING.md §3 for the proxy options.
- The phone apps (Capacitor) are not part of "website first". The PWA works from the browser
  ("Add to Home Screen").
- This kit was written without a Docker daemon in the build sandbox: the compose files were
  validated and the app was run natively, but the images were **not** built there. The first
  `up -d --build` on your server is the real test.
