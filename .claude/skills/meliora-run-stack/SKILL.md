---
name: meliora-run-stack
description: Start, stop, reset, seed and health-check the Meliora Gym platform locally (11 NestJS microservices on Redis + Postgres, React web, Expo mobile, door agent, n8n) or with Docker Compose. Use this whenever you need to run, restart, demo, debug or verify anything end to end in this repo — "lance le projet", "start the backend", "the API returns 503", "seed demo data", "test the app on my phone", "docker compose up" — even if the user only names one part.
---

# Run the Meliora stack

The backend is 10 microservices + 1 API gateway that only talk over the message bus, so a
feature works only when every service it touches is running. Prefer running the whole stack.

## Prerequisites (local, no Docker)
- PostgreSQL on :5432 (Homebrew) and Redis on :6379 (`redis-cli ping` → PONG).
- `backend/.env` (copy of `.env.example`; `DB_USER` = your macOS user locally).
- Node 20 for backend/web/door-agent; **Node ≥ 22.13 for `mobile/`** (Expo SDK 58) —
  `/opt/homebrew/bin/node` works, the default nvm Node 20 does not.

## Backend
```bash
cd backend
npm install
npm run db:create          # one database per service (idempotent)
npm run build              # all 11 apps → dist/apps/<app>/main.js
npm start                  # all services with concurrently (or `npm run dev` = watch mode)
curl -s localhost:4000/api/health   # every service must be "up"
npm run seed               # demo data through the gateway (needs the stack up)
```
- Swagger: http://localhost:4000/docs · door agents: ws path `/agent-socket` (proxied to :4004).
- Call one service directly on the bus, without the gateway: `npm run rpc -- plans.list '{}'`
  (`--emit` to publish an event). Useful to tell a gateway bug from a service bug.
- Logs: run services individually (`node dist/apps/<app>/main.js`) to read one service's output.

## Reset to a clean demo
Services create their tables on boot (`DB_SYNCHRONIZE=true`) and seed defaults (admin user,
rooms, exercises, workflow templates). So: stop services → drop the `meliora_*` databases →
`npm run db:create` → start → `npm run seed`. The seed refuses to run twice unless `--force`.
Login rate limit is 10/min per IP: scripts that log in many users will get 429.

## Front-ends and agents
- Web: `cd web && npm run dev` → http://localhost:5173 (Vite proxies /api and sockets to :4000).
- Mobile: `cd mobile && npx expo start`; on a phone set `EXPO_PUBLIC_API_URL=http://<LAN-IP>:4000`.
- Door agent: `cd door-agent && npm run dev` (or `npm run mock-server` to test without hardware).
- n8n: `cd n8n && docker compose up -d` (see `.claude/skills/meliora-n8n-automation`).

## Docker (everything)
```bash
cp .env.example .env    # set every secret
docker compose up -d --build
```
Web :8080 · API :4000 · n8n :5678 · door agent: `docker compose --profile agent up -d door-agent`.

## When something fails
- `503 Service indisponible (pattern)`: the service owning that pattern is down or crashed — check
  its log; the gateway timeout is 10 s.
- `EADDRINUSE :4000/:4004`: an old process — `pkill -f "dist/apps/"`.
- Data looks stale in access-service: it rebuilds its read model from membership every 10 minutes
  and on boot; restart access-service to force it.
- Before declaring a change done, run the end-to-end checks you touched (HTTP through the gateway),
  not only unit tests.
