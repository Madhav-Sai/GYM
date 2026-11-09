# website

A small static page for myGym: plain HTML/CSS/JS, no build step, served by any static
web server.

- `index.html`: the landing page. Its `styles.css?v=N` is the one cache-busting number the
  pages share; `scripts/build-api-docs.mjs` reads it from here.
- `api.html`: the API reference, generated from `api/openapi.yaml`. Do not edit it by hand:
  run `node scripts/build-api-docs.mjs` (CI runs it with `--check`).
- `styles.css`, `site.js`: the shared look and behaviour.
