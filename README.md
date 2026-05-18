# ru-meters-bot

One-shot Node service that submits monthly meter readings to Russian
utility portals via their JSON REST APIs (login → JWT → debt + device
list → create-reading → verify). No browser, no Chromium.

Supported portals (one adapter per portal, see `src/portals/`):

- **ТГК-1** (`tgc1.ru`) — heating / hot water.
- **pesc.ru** — Petroelektrosbyt; geo-blocks non-RU egress, so from
  outside Russia route it through an HTTP proxy via `PESC_PROXY_URL`.

Each enabled portal is driven once per invocation; results are reported
to Telegram. State (per-period submitted values, attempt counters) is
kept in an SQLite file under `METERS_DATA_DIR`.

## Usage

```bash
# Run every enabled portal for the current period.
node src/index.ts

# Only one portal.
node src/index.ts --portal=tgc1

# Ignore the day-of-month gate and the "done" row status (still respects
# the per-period attempts cap).
node src/index.ts --force
```

A portal is "enabled" when its `*_LOGIN` env var is set (see below).
With no `--portal` flag, every enabled portal runs in order.

An in-code gate (`schedule.ts::targetDay`) no-ops on days outside the
configured submission window — useful when wiring a cron / systemd timer
that fires more often than strictly needed.

## Configuration

Copy `.env.example` → `.env` and fill in. The bot auto-loads `.env` next
to `package.json` when run via `node src/index.ts`. In Docker, supply
the same variables via `env_file:` or `environment:` instead.

Required: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
Per-portal: `TGC1_LOGIN`/`TGC1_PASSWORD`, `PESC_LOGIN`/`PESC_PASSWORD`
(+ `PESC_TOTP_SECRET` if 2FA is on, + `PESC_PROXY_URL` if you need a
Russian exit). Optional runtime: `METERS_DATA_DIR`, `TZ`, `LOG_LEVEL`.

See [`.env.example`](.env.example) for the full list with comments.

## Local development

```bash
npm install
npm run typecheck
npm test
```

Requires Node 24+ — uses native TypeScript stripping, no build step.
Imports use `.ts` extensions; no `enum` / `namespace` / parameter
properties (strip-only mode).

## Docker

`Dockerfile` builds a slim `node:24-alpine` image. CI publishes
`ghcr.io/maxmaxme/ru-meters-bot:latest` and `:sha-<short>` on every push
to `main`.

```bash
docker run --rm \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  ghcr.io/maxmaxme/ru-meters-bot:latest --force
```