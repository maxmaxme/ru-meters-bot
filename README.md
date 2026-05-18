# ru-meters-bot

One-shot Node service that submits monthly meter readings to ТГК-1 and
pesc.ru via their JSON REST APIs (login → JWT → debt + device list →
create-reading → verify). No browser, no Chromium.

Designed to run on a Raspberry Pi inside the
[voice-assistant](https://github.com/maxmaxme/voice-assistant) docker
compose stack, scheduled by a host systemd timer Mon–Fri 12:00 МСК on
calendar days 15–21. An in-code gate (`schedule.ts::targetDay`) no-ops
on dates before the first weekday ≥ 15. Manual run:

```bash
docker compose run --rm meters-bot --force
```

## Image

Published by CI to `ghcr.io/maxmaxme/ru-meters-bot:latest` and
`:sha-<short>` for every push to `main`. Slim `node:24-alpine` base.

## Local development

```bash
npm install
npm run typecheck
npm test
```

Node 24 native TypeScript stripping — no build step. Imports use `.ts`
extensions; no `enum` / `namespace` / parameter properties.

## Configuration

Reads credentials and runtime knobs from environment variables (typically
fed via `--env-file ../.env` from the parent voice-assistant compose).
See `src/config.ts` for the full list. Notable:

- `PESC_PROXY_URL` — optional HTTP CONNECT/SOCKS5 proxy URL. pesc.ru
  geo-blocks non-RU egress, so on the Pi this points at the
  `sing-box-ru` container in the voice-assistant compose. tgc1.ru works
  directly.
- `METERS_DATA_DIR` — SQLite state directory (`/app/data` in the image).
- `TZ` — IANA timezone for the scheduling gate.

## Design

Original design doc lives in the voice-assistant repo under
`docs/superpowers/specs/2026-05-16-ru-meters-bot-design.md`.
