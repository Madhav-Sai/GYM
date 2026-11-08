# Deploy on Railway (Hobby) + your Cloudflare domain

Two Railway services from this one repo, plus a volume. **No Vercel, no database needed yet.**

| Service | What it is | Public? |
|---|---|---|
| `api` | openGym's Node API. Keeps everything in a **volume** mounted at `/data`. | No (private only) |
| `web` | nginx: the app, the exercise media, and `/api` proxied to `api`. | **Yes**, on your domain |

> **Why not Vercel?** Vercel is serverless with no persistent disk, and openGym's API is a long-running
> server that writes to `/data`. It can't run there. Vercel could only host the static frontend, and
> `web` already does that and serves the 216 MB of exercise media, so Vercel would add a second host and
> a proxy hop for no gain. If you still want it later it's an add-on, not a dependency.
>
> **Database:** openGym stores files in the volume, so nothing to set up now. When we build the leftover
> modules (diet, labs, supplements) we'll add a Railway Postgres then.

Replace `gym.YOURDOMAIN` with a subdomain of your Cloudflare-managed site, e.g. `gym.pentestnotes.xyz`.
**Use the real subdomain from step 1**: passkeys are bound to the exact hostname, so you can't register one
on a `*.up.railway.app` address and move it later.

## Step 1. Pick the hostname
Decide `gym.YOURDOMAIN` now. Everything below uses it.

## Step 2. Create the `api` service
1. Railway → **New Project → Deploy from GitHub repo → `Madhav-Sai/GYM`**.
2. Service **Settings**:
   - **Service name:** `api` (exactly: the web service reaches it as `api.railway.internal`).
   - **Source → Branch:** `claude/pensive-tesla-tl5xxk` (or `main` once this is merged).
   - **Root Directory:** `/api`. Railway then finds `api/Dockerfile` (its last stage, `default`, is the one built).
3. **Variables** (Raw editor is easiest):
   ```
   PORT=3000
   DATA_DIR=/data
   ORIGIN=https://gym.YOURDOMAIN
   RP_ID=gym.YOURDOMAIN
   RP_NAME=openGym
   TRUST_PROXY=1
   FIRST_USER_ADMIN=1
   INTEGRATIONS=webhook,whoop
   ```
   Whoop's three values (`WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET`, `WHOOP_REDIRECT_URI=https://gym.YOURDOMAIN/api/integrations/oauth/callback`)
   come later (step 8). Leaving `whoop` in `INTEGRATIONS` without them is harmless: it stays off.
4. **Add the volume:** in the project canvas **+ New → Volume**, attach it to `api`, **mount path `/data`**.
   Volumes mount when the container *starts*, not during the build, and as root. If the logs ever show
   `EACCES` on `/data`, see Troubleshooting.
5. **Do not** generate a public domain for `api`.

## Step 3. Create the `web` service
1. In the same project: **+ New → GitHub Repo → `Madhav-Sai/GYM`** (same repo again).
2. **Settings:** name it `web`, same branch as `api`, **Root Directory: `/`** (leave empty; this Dockerfile
   needs the whole repo), and add the variable `RAILWAY_DOCKERFILE_PATH=web/Dockerfile`.
3. **Variables:**
   ```
   NGINX_PORT=3000
   PORT=3000
   BACKEND=api.railway.internal
   RESOLVER_AUTO=1
   ```
   `PORT` here is the **API's** port (openGym's nginx template calls it that), `NGINX_PORT` is the port nginx
   itself listens on. Both 3000 so Railway's target port, nginx and the API can't disagree.
4. Deploy. The first build is the slow one (it bundles the app and ~216 MB of media).

## Step 4. Smoke-test before touching DNS
`web` → **Settings → Networking → Generate Domain**, and when it asks for the port choose **3000**. Then open
`https://<that-domain>/api/health`. You should see `{"ok":true,"users":0,"writable":true}`.
- `writable:true` means the volume works.
- A **502** means the target port is wrong (edit the domain's port to 3000) or `api` isn't running.
- Don't create your profile here (wrong hostname for passkeys). This is only a wiring check.

## Step 5. Your domain, on Cloudflare
1. `web` → Settings → Networking → **+ Custom Domain** → `gym.YOURDOMAIN`, port **3000**.
2. Railway shows **two records**. Add **both** in Cloudflare → DNS:
   - a **CNAME**: name `gym`, target = the value Railway shows;
   - a **TXT**: the name and value Railway shows. *Without the TXT, the domain returns 404 even once the CNAME resolves.*
3. Set both records to **DNS only (grey cloud)** until Railway shows the green check.
4. Optional afterwards: turn the orange cloud on and set Cloudflare **SSL/TLS to Full**. Railway notes this for
   wildcard domains; for a plain subdomain it is the sensible equivalent but I haven't seen it spelled out. If the
   site loops or errors after proxying, switch back to grey.
Hobby allows 2 custom domains per service, so this uses one.

## Step 6. First visit
`https://gym.YOURDOMAIN` → **create your profile first** (a passkey). `FIRST_USER_ADMIN=1` makes the first
profile the admin. Then on `api` add `INVITE_ONLY=1` and `ALLOW_GUEST=0` so nobody else can sign up.

## Step 7. Check what works
Log a workout, then reload and confirm it's still there. **Redeploy `api` once** and confirm it's *still* there.
That proves the volume really persists (if it vanished, the volume isn't attached at `/data`).

## Step 8. Whoop (when you're ready)
Follow [docs/WHOOP.md](../docs/WHOOP.md): create the app at Whoop, register
`https://gym.YOURDOMAIN/api/integrations/oauth/callback`, add the three `WHOOP_*` variables to `api`, redeploy.

## Backups
The whole state is `/data`. In the app: **Settings → Data & backup** (works anywhere). With the Railway CLI,
`railway volume browse /` and `railway volume files` can download files (documented by Railway). I have not checked
whether Hobby includes automatic volume backups: don't assume it does.

## What was and wasn't verified
Checked in Railway's docs today: volumes mount at the path you pick, at runtime, as root; custom domains need a
CNAME **and** a TXT; Hobby = 2 custom domains/service; private names are `<service>.railway.internal`, resolving to IPv4
and IPv6 in environments created after 16 Oct 2025 (openGym's nginx uses IPv4, so create a **new** project, not an old
one); `RAILWAY_DOCKERFILE_PATH` and Root Directory; a wrong target port gives a 502.

**Not verified** (no Docker/Railway account here): that these images build on Railway; that nginx's entrypoint runs our
`10-resolver-auto.envsh` (unit-tested in isolation, not inside the image). If `https://gym.YOURDOMAIN/api/health`
fails with a resolver error in `web`'s logs, set `RESOLVER` on `web` to the nameserver in the container's
`/etc/resolv.conf` (bracketed if IPv6) and remove `RESOLVER_AUTO`.

## Troubleshooting
- **502 on the domain:** target port ≠ 3000, or `web` can't reach `api` (service must be named `api`; `BACKEND=api.railway.internal`).
- **404 on the custom domain:** the TXT record is missing or hasn't verified.
- **`EACCES` writing `/data`:** Railway mounts volumes as root; if `api` runs as a non-root user, set `RAILWAY_RUN_UID=0` on `api`
  (Railway's documented variable for this).
- **"cross-origin request refused" / login fails:** `ORIGIN` on `api` must equal exactly what's in the browser bar (`https://gym.YOURDOMAIN`, no trailing slash).
- **Passkey errors:** `RP_ID` must be exactly `gym.YOURDOMAIN` (no `https://`).
- **Everyone throttled together:** the API sees Railway's proxy as the client address. Fine for one person.
