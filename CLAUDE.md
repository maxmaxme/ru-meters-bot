# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

One-shot Node/TS service that submits monthly meter readings to Russian
utility portals via their JSON REST APIs (login → JWT → debt + device
list → create-reading → verify). No browser, no Chromium. Each
invocation runs every enabled portal once, reports to Telegram, and
exits. State persists in SQLite under `METERS_DATA_DIR`.

CI publishes `ghcr.io/maxmaxme/ru-meters-bot:latest` (and
`:sha-<short>`) on every push to `main`. Scheduling (cron / systemd
timer / k8s CronJob) is the deployer's job — nothing in this repo
schedules itself.

## Commands

```bash
npm install
npm run typecheck                 # tsc --noEmit
npm test                          # vitest run
npm run test:watch
npm run test:coverage             # ./coverage (html + lcov + cobertura)
npx vitest run tests/pesc.test.ts -t "name"   # one test

node src/index.ts                            # every enabled portal
node src/index.ts --portal=tgc1              # one portal
node src/index.ts --force                    # ignore day-of-month gate + done-status
```

A portal is "enabled" iff its `*_LOGIN` env is set. `.env` next to
`package.json` is auto-loaded by `src/index.ts`. In Docker, supply
env vars via `env_file:` / `environment:` instead.

There is no `lint` / `format` script — `typecheck` + `test` are the
verification path. CI: `.github/workflows/ci.yml` runs typecheck +
`test:coverage`, uploads the coverage dir as an artifact.

## Critical conventions

**Node 24 native TypeScript stripping, no build step.** Run `.ts`
directly via `node src/index.ts`. No `tsc` build, no `dist/`, no `tsx`.
Consequences:

1. Relative imports use `.ts` extensions, not `.js`.
2. No `enum`, no `namespace`, no parameter properties
   (`constructor(private x: T)`), no decorators — strip-only mode
   rejects them. Declare fields explicitly.

`tsconfig.json` has `noEmit: true` + `allowImportingTsExtensions: true`.

**Portal adapters live behind a uniform interface** in
[src/portals/types.ts](src/portals/types.ts), registered in
[src/portals/registry.ts](src/portals/registry.ts). Adding a portal =
new file under `src/portals/`, register it, add `*_LOGIN`/`*_PASSWORD`
env handling in [src/env.ts](src/env.ts). Don't reach into a portal
from `runOnce.ts` — go through the registry.

**Day-of-month gate** lives in
[src/schedule.ts](src/schedule.ts)`::targetDay`. Default window is the
15–21 of each month, Mon–Fri 12:00 МСК — useful when the systemd timer
fires more often than strictly needed. `--force` skips the gate but
still respects the per-period attempts cap in SQLite.

**pesc.ru geo-blocks non-RU egress.** Set `PESC_PROXY_URL` to route
that portal's HTTP traffic through a Russian exit (any forward proxy
that pesc.ru accepts works). Other portals are direct.

**State semantics in SQLite** (`src/storage/`): rows are keyed
`(portal, period)`. Status transitions `pending → done` (success) or
stay `pending` with `attempts++` and `last_error` set. The
`attempts` cap is in `runOnce.ts` — once hit, the row is skipped until
the next period rolls over.

**TOTP for pesc** via `PESC_TOTP_SECRET` when 2FA is on. Without the
secret the portal returns an auth error and the run is reported as a
failure (no silent retry).

## Architecture

```
src/index.ts                       # entry — parses CLI, loads .env, calls runOnce()
src/cli.ts                         # parseCliArgs, USAGE
src/env.ts                         # typed env access + portal discovery
src/period.ts                      # current submission period (YYYY-MM)
src/schedule.ts                    # targetDay() gate
src/runOnce.ts                     # the actual loop: for each portal → submit → record → notify
src/portals/
  types.ts                         # Portal interface (login, fetchMeters, submit, …)
  registry.ts                      # name → adapter
  tgc1.ts                          # ТГК-1 (heating / hot water)
  pesc.ts                          # pesc.ru (Petroelektrosbyt) — uses PESC_PROXY_URL, optional TOTP
src/storage/
  sqlite.ts                        # better-sqlite3 wrapper
  migrations.ts                    # TS string constants; runner skips already-applied versions
  types.ts                         # row shapes
src/notify/
  telegram.ts                      # one message per run, summarizing per-portal outcomes
  types.ts
src/logger.ts                      # pino; level via LOG_LEVEL
tests/                             # vitest, one file per src module
```

## Configuration

Required: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
Per-portal: `TGC1_LOGIN`/`TGC1_PASSWORD`, `PESC_LOGIN`/`PESC_PASSWORD`
(+ optional `PESC_TOTP_SECRET`, `PESC_PROXY_URL`).
Optional runtime: `METERS_DATA_DIR` (defaults to `./data`), `TZ` (IANA),
`LOG_LEVEL`.

See [`.env.example`](.env.example) for the comprehensive list.

## Docker

`Dockerfile` builds on `node:24-alpine`. CI cross-builds amd64+arm64
and pushes to `ghcr.io/maxmaxme/ru-meters-bot`. Local run:

```bash
docker run --rm \
  --env-file .env \
  -v "$(pwd)/data:/app/data" \
  ghcr.io/maxmaxme/ru-meters-bot:latest --force
```

