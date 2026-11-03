# Meliora Gym platform — guide for Claude

Gym management system for **Meliora Gym** (Khzema Est, Rue Colonel Garnaoui, Sousse, Tunisia —
Instagram @gymmeliora, Facebook https://www.facebook.com/p/Meliora-Gym-61589769249533/). Owner-facing
language: French. UI languages: French (default), English, Arabic (RTL). Currency TND (3 decimals),
timezone `Africa/Tunis`.

## Repo map
| Folder | What | Stack |
|---|---|---|
| `backend/` | API gateway + 10 microservices, one Postgres DB each | NestJS 11 monorepo, TypeORM, Redis bus (NATS in prod) |
| `web/` | Public website + admin back-office | React 19, Vite, Tailwind 4, TanStack Query, Three.js hero |
| `mobile/` | Member app (pass QR, door, classes, training) | Expo SDK 58, Expo Router — **Node ≥ 22.13** |
| `door-agent/` | Runs on the gym LAN, drives ZKTeco terminals / relays | Node 20 + TypeScript, socket.io-client, zkteco-js |
| `n8n/` | Customer e-mails, reports and content automations | n8n 2.45 workflows + HTML templates |
| `docs/API.md` | **The contract** for REST, sockets, QR code, webhooks, automation API | — |
| `.github/workflows/` | CI, branch flow, quality, deploy (`deploy/README.md`) | GitHub Actions, ghcr.io, SSH + compose |
| `assets/images/` | Real gym photos and logo (use them, don't invent visuals) | — |

## How the backend fits together
`client → api-gateway (:4000, JWT + roles + validation + Swagger /docs) → bus → service → its own DB`.
- Request/response: `RpcClient.send(PATTERNS.x.y, payload)`; fan-out: `EventBus.publish(EVENTS.z, data)`.
- Services: auth, membership (members, plans, subscriptions, payments, CRM, promos, KPIs), class
  (sessions, reservations, waitlist, strikes), access (doors, QR, agents, check-ins), notification
  (n8n webhooks outbox, Expo push), staff (HR, roster, time clock, payroll), facility (rooms,
  equipment, maintenance, lockers), commerce (shop/POS, stock, expenses, finance), training
  (programs, measurements, PT), workflow (task DAGs, triggers, automations).
- Shared contracts live in `backend/libs/common/src` (contracts, patterns, events). **Change contracts
  first**, then services, gateway, `docs/API.md`, then web/mobile types. Never read another service's
  database; call its patterns or keep a read model fed by its events.
- Member id = auth user id. `/api/me/*` always uses the token's user id.
- Errors: throw Nest HttpExceptions with French messages; they travel as `{ statusCode, message }`.

## Commands (details in the meliora-run-stack skill)
```bash
cd backend && npm run db:create && npm run build && npm start   # whole backend
curl -s localhost:4000/api/health                                 # all services "up"
npm run seed                                                      # demo data (once; --force to repeat)
npm run rpc -- <pattern> '<json>'                                 # call one service on the bus
npx tsc --noEmit -p apps/<app>/tsconfig.app.json && npx jest apps/<app>
cd web && npm run dev        # :5173      cd mobile && npx expo start
cd door-agent && npm run mock-server / npm run dev               cd n8n && npm run check
docker compose up -d --build                                      # everything (see .env.example)
```

## Rules that matter here
- Git: new branch from `main` for every task, scoped conventional commits after each verified piece,
  push right after; then merge into `sandbox` (deploys the sandbox server) → `prod` (production) →
  `main`, never skipping a stage (meliora-git-workflow skill, `deploy/README.md`). Only the
  orchestrator runs git when agents work in parallel; stage explicit paths.
- CI must stay green: whatever you add needs its check in `.github/workflows/ci.yml` (typecheck,
  lint, unit tests, build). Rules and definition of done: `CONTRIBUTING.md`.
- Verify with the real stack, not only unit tests: build, start, call through the gateway.
- Keep `backend/libs/common/src/utils/access-code.ts` and `mobile/src/lib/accessCode.ts` identical in
  behaviour (rotating QR `MLR1.<code>.<step>.<sig>`).
- Money as numbers (TND), dates as ISO strings, calendar days as `YYYY-MM-DD` in the gym timezone.
- Every user-facing string in web/mobile goes through the i18n layer (fr reference, en, ar + RTL).
- Demo/test data uses `@example.com` e-mails only — n8n sends real e-mails.

## Known gaps / gotchas
- No TypeORM migrations yet: schemas come from `DB_SYNCHRONIZE=true`. Add migrations before production;
  they must include `refresh_sessions`, `user_photos` (FK `ON DELETE CASCADE`) (auth), `doors.allowAppOpen`,
  `access_logs.context`, `access_members.removedAt` (access) and `member_photos` (FK `ON DELETE CASCADE`),
  `members.photoUpdatedAt` (membership).
- Redis transport = single replica per service; use `BUS_TRANSPORT=nats` (queue groups) to scale.
  The NATS path (with `NATS_TOKEN`) is configured but has not been run end to end.
- Refresh tokens are single-use: every `POST /api/auth/refresh` returns a new one, and scripts and clients
  must keep the newest. The replaced token works 30 s more (`REFRESH_REUSE_LEEWAY_SECONDS`); replaying it
  later revokes that whole sign-in (401). Tokens issued before rotation existed get 401 once.
- Rate limits run after auth: signed-in calls are counted per account and route (300/min by default),
  `@Public` routes per client IP (login 10/min, register and trial 5/min) — scripts that log in many
  users get 429.
- `TRUST_PROXY` (gateway) decides whose `X-Forwarded-For` is believed; it feeds the per-IP limits and
  `APP_OPEN_ALLOWED_NETWORKS`. The default trusts every private address, so on a server inside the gym
  LAN (or with IPv6 clients reaching :8080 through Docker's proxy) set a hop count instead.
- Docker: the gateway (4000) and the n8n editor (5678) listen on 127.0.0.1; browsers, the app and door
  agents use :8080 (nginx). `NODE_ENV=production` refuses example, weak or reused secrets at startup, so
  the values of `backend/.env.example` only work in development.
- `npm run rpc`, `npm run seed` and `npm run db:create` load `.env` with dotenv, not `loadEnv()`: no
  production check, and the seed falls back to `ADMIN_PASSWORD=Meliora2026!`. The Docker images do not
  contain `scripts/`: seed a server from a one-off container (`deploy/README.md`, demo data).
- Gateway validation converts nothing implicitly: bodies keep their JSON types (`"30"` for a number is a
  400) and numeric query fields need `@Type(() => Number)` (`validation.spec.ts` checks every `*Query` DTO).
- Gym phone, opening hours and exact GPS point are placeholders (env `GYM_*`) — confirm with the owner.
- Pushing needs the SSH key loaded (`ssh-add --apple-use-keychain ~/.ssh/id_rsa`).
- Logout does not yet remove the device's Expo push token.
- Class reminders (`booking.reminder`) are an app push only: n8n workflow 01 has no branch for them, so a
  member booked at the desk without the app is not reminded (nor told when the class moves).

Still open after the security review (not fixed):
- App door opening: `APP_OPEN_ALLOWED_NETWORKS` is empty by default (check off), so a faked GPS position
  opens any door with `allowAppOpen`; once set, anyone on the gym Wi-Fi passes. Real proof of presence
  needs a BLE beacon / NFC tag, or the door reader scanning the phone's QR.
- Outbound guard: DNS rebinding between `assertOutboundAllowed` and `fetch` is not covered (needs a
  pinned-lookup dispatcher; undici is not a dependency), its DNS lookup has no timeout, and Azure's
  `168.63.129.16` counts as public. Every path of the trusted n8n host is open to automations.
  notification-service (n8n webhooks, Expo push) refuses redirects but does not run its env URLs through
  the guard (the operator sets them); the door agent's HTTP relay driver follows redirects (LAN, by design).
- Sessions: access tokens stay valid until they expire (≤ 15 min) after logout, password change,
  deactivation or demotion, on HTTP and on `/live`. A refresh answer lost and retried after the 30 s
  leeway signs the user out. A staff account signing in on the member app also ends its back-office
  sessions (the app logs it out).
- QR rotation does not sign out a lost phone (no route yet to end a member's sessions), and the mobile
  pass does not refetch the key when the app comes back to the foreground.
- Web client: a tab is not told when another tab signs out (no `storage` listener), so its live feed
  stays offline and retries every 60 s until the page is reloaded.
- Outside docker-compose, production does not require `REDIS_PASSWORD` / `NATS_TOKEN` (compose enforces
  bus auth), and a webhook delivery refused for missing keys is not resent once they are set. An old
  example `N8N_ENCRYPTION_KEY` is not detected (only n8n reads it).
- Door agents: a stolen agent key can log GRANTED punches (≤ 7 days old) for existing members on its own
  doors — delete the agent to revoke it. On a server error `device.events` answers `{0,0,0}` and the agent
  drops that batch; a terminal clock more than 7 days behind gets its punches rejected.
- Door config: secrets inside a relay body string or URL path are not masked; relay passwords and tokens
  staff could read before this release should be changed on the relays. A relay door whose URL still
  holds `user:password@` must move it to `basicAuth` before it can be saved again.
- Coaches never see tasks assigned only to their employee id (the gateway does not pass `employeeId`).
- Deleted members stay as tombstones with their unique `memberCode`: after a membership DB reset, reused
  codes would fail to sync.
- n8n workflow 01's signature and timestamp checks were validated against the n8n sources, not run end
  to end: send one real event after deploying.

## Skills and workflows in this repo
Skills (`.claude/skills/`): meliora-run-stack, meliora-git-workflow, meliora-add-microservice,
meliora-door-integration, meliora-n8n-automation, frontend-design, webapp-testing.
Workflows (`.claude/workflows/`): `meliora-feature` (contract-first multi-agent delivery),
`meliora-review` (multi-angle review with adversarial verification).
