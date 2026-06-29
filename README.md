<div align="center">

# 🚰 ru-meters-bot

**Submits your monthly utility meter readings to Russian portals — automatically,
headless, no browser.**

One-shot Node/TS service: it logs into each portal's JSON REST API, reads your
devices, submits the new values, verifies them, and reports the run to Telegram.

[![CI](https://github.com/maxmaxme/ru-meters-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/maxmaxme/ru-meters-bot/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-43853d?logo=node.js&logoColor=white)](package.json)
[![Container](https://img.shields.io/badge/ghcr.io-ru--meters--bot-2496ED?logo=docker&logoColor=white)](https://github.com/maxmaxme/ru-meters-bot/pkgs/container/ru-meters-bot)

</div>

---

Each invocation runs every **enabled** portal once (login → JWT → debt + device
list → create-reading → verify), summarizes the outcome to Telegram, and exits.
State — submitted values and attempt counters, keyed `(portal, period)` — lives
in an SQLite file under `METERS_DATA_DIR`. There is no browser and no Chromium.

It doesn't schedule itself: point a cron job / systemd timer / k8s CronJob at it.
An in-code day-of-month gate (`schedule.ts::targetDay`, default 15–21, Mon–Fri
12:00 МСК) no-ops outside the window, so a timer that fires more often than
needed is harmless.

## 🔌 Supported portals

One adapter per portal (`src/portals/`); a portal is **enabled** iff its
`*_LOGIN` env var is set.

| Portal                  | Domain     | Notes                                                              |
| ----------------------- | ---------- | ------------------------------------------------------------------ |
| **ТГК-1**               | `tgc1.ru`  | heating / hot water                                                |
| **pesc.ru** (Петроэлектросбыт) | `pesc.ru` | geo-blocked outside RU — route via `PESC_PROXY_URL`; optional TOTP |

Adding one: a new file under `src/portals/`, register it in `registry.ts`, add
its `*_LOGIN` / `*_PASSWORD` handling in `env.ts`.

## 🚀 Usage

```bash
node src/index.ts                 # every enabled portal, current period
node src/index.ts --portal=tgc1   # just one
node src/index.ts --force         # ignore the day-gate + "done" status
                                  # (still respects the per-period attempts cap)
```

## ⚙️ Configuration

Copy `.env.example` → `.env` and fill it in (auto-loaded next to `package.json`;
in Docker pass the same vars via `env_file:` / `environment:`).

| Variable                                       | Required?            |
| ---------------------------------------------- | -------------------- |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`       | yes — run reporting  |
| `TGC1_LOGIN` / `TGC1_PASSWORD`                 | to enable ТГК-1      |
| `PESC_LOGIN` / `PESC_PASSWORD`                 | to enable pesc.ru    |
| `PESC_TOTP_SECRET`                             | if pesc 2FA is on    |
| `PESC_PROXY_URL`                               | if outside Russia    |
| `METERS_DATA_DIR` · `TZ` · `LOG_LEVEL`         | optional runtime     |

See [`.env.example`](.env.example) for the full list with comments.

## 🧪 Development

```bash
npm install
npm run typecheck
npm test
npm run test:coverage   # ./coverage (html, lcov, cobertura)
```

Node 24+ — native TypeScript stripping, **no build step**. Imports use `.ts`
extensions; no `enum` / `namespace` / parameter properties (strip-only mode). CI
runs typecheck + coverage on every push.

## 🐳 Docker

CI cross-builds amd64 + arm64 and publishes `ghcr.io/maxmaxme/ru-meters-bot`
(`:latest` and `:sha-<short>`) on every push to `main`.

```bash
docker run --rm \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  ghcr.io/maxmaxme/ru-meters-bot:latest --force
```

## 📄 License

Copyright © 2026 maxmaxme.

Licensed under the **GNU Affero General Public License v3.0 or later**
([AGPL-3.0-or-later](LICENSE)). Use, study, modify, and self-host it freely — but
any modified version you distribute **or run as a network service** must also be
released under the AGPL, source and all. No warranty.
