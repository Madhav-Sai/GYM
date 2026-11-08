# myGym

A self-hosted gym, nutrition and recovery tracker, by **Madhav**. It runs on your own server, keeps its data in a
folder you own, and works as a website you can install on your phone.

myGym is built on [openGym](https://github.com/DuarteSantos8/openGym) by Duarte Santos (AGPL-3.0). See
[`UPSTREAM.md`](UPSTREAM.md) and [`NOTICE.md`](NOTICE.md).

## What's different from upstream
- **Whoop** connection: recovery, sleep, strain, steps and workouts ([`docs/WHOOP.md`](docs/WHOOP.md)).
- **Manual gym check-in** that counts towards your streak and shows on the calendar.
- **Admin from the environment** (`ADMIN_NAME` + `ADMIN_PASSWORD`), no passkey needed.
- **Hosting kit** for Railway + Cloudflare, or any Docker host ([`deploy/`](deploy/)).

The full list is in [`UPSTREAM.md`](UPSTREAM.md).

## Run it
```bash
cp .env.example .env     # edit it
docker compose up -d --build
```
Open <http://localhost:8080>. To put it on the internet, follow [`deploy/README.md`](deploy/README.md) or
[`deploy/RAILWAY.md`](deploy/RAILWAY.md).

## Licence
AGPL-3.0, like the code it is based on ([`LICENSE`](LICENSE)). If you run a modified copy as a service, the
AGPL requires you to offer its source to the people using it: this repository is that source. The exercise
images are **not** AGPL: see [`NOTICE.md`](NOTICE.md) (non-commercial use only).
