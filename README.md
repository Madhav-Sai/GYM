# myGym

A personal, self-hosted gym and health tracker, by **Madhav**. Plan routines, log workouts, track body
weight, recovery, sleep and steps. It runs on your own server, keeps its data in a folder you own, and works
as a website you can install on your phone. No third-party account, no telemetry.

Source: <https://github.com/Madhav-Sai/GYM>. Running instance: <https://madhav.pentestnotes.tech>.

## Features
- Routines, progression rules, warm-ups, supersets and cardio, with estimated 1RM and personal records.
- Body weight and measurements, a fatigue and recovery map, and stats over time.
- **Whoop** connection: recovery, sleep, strain, steps and workouts ([`docs/WHOOP.md`](docs/WHOOP.md)).
- **Manual gym check-in** that counts towards your streak and shows on the calendar.
- **Admin from the environment** (`ADMIN_NAME` + `ADMIN_PASSWORD`), no passkey needed.
- Passkey (WebAuthn) or password sign-in, installable as a PWA.
- **Hosting kit** for Railway + Cloudflare, or any Docker host ([`deploy/`](deploy/)).

## Run it
```bash
cp .env.example .env     # edit it
docker compose up -d --build
```
Open <http://localhost:8080>. To put it on the internet, follow [`deploy/README.md`](deploy/README.md) or
[`deploy/RAILWAY.md`](deploy/RAILWAY.md). More guides are in [`docs/`](docs/README.md).

## Licence
myGym is built on openGym and, like it, licensed under the AGPL-3.0 ([`LICENSE`](LICENSE)); what changed is
recorded in [`UPSTREAM.md`](UPSTREAM.md). If you run a modified copy as a service, the AGPL requires you to
offer its source to the people using it: this repository is that source. The exercise images are **not**
AGPL: see [`NOTICE.md`](NOTICE.md) (non-commercial use only).
