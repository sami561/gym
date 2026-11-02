# Meliora Gym platform — guide for Claude

Gym management system for **Meliora Gym** (Khzema Est, Rue Colonel Garnaoui, Sousse, Tunisia —
Instagram @gymmeliora). Owner-facing language: French. UI languages: French (default), English,
Arabic (RTL). Currency TND (3 decimals), timezone `Africa/Tunis`.

## Repo map
| Folder | What | Stack |
|---|---|---|
| `backend/` | API gateway + 10 microservices, one Postgres DB each | NestJS 11 monorepo, TypeORM, Redis bus (NATS in prod) |
| `web/` | Public website + admin back-office | React 19, Vite, Tailwind 4, TanStack Query, Three.js hero |
| `mobile/` | Member app (pass QR, door, classes, training) | Expo SDK 58, Expo Router — **Node ≥ 22.13** |
| `door-agent/` | Runs on the gym LAN, drives ZKTeco terminals / relays | Node 20 + TypeScript, socket.io-client, zkteco-js |
| `n8n/` | Customer e-mails, reports and content automations | n8n 2.45 workflows + HTML templates |
| `docs/API.md` | **The contract** for REST, sockets, QR code, webhooks, automation API | — |
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
  push right after (meliora-git-workflow skill). Only the orchestrator runs git when agents work in
  parallel; stage explicit paths.
- Verify with the real stack, not only unit tests: build, start, call through the gateway.
- Keep `backend/libs/common/src/utils/access-code.ts` and `mobile/src/lib/accessCode.ts` identical in
  behaviour (rotating QR `MLR1.<code>.<step>.<sig>`).
- Money as numbers (TND), dates as ISO strings, calendar days as `YYYY-MM-DD` in the gym timezone.
- Every user-facing string in web/mobile goes through the i18n layer (fr reference, en, ar + RTL).
- Demo/test data uses `@example.com` e-mails only — n8n sends real e-mails.

## Known gaps / gotchas
- No TypeORM migrations yet: schemas come from `DB_SYNCHRONIZE=true`. Add migrations before production.
- Redis transport = single replica per service; use `BUS_TRANSPORT=nats` (queue groups) to scale.
  The NATS path is configured but has not been run end to end.
- Login is rate limited (10/min per IP) — scripts that log in many users get 429.
- Gym phone, opening hours and exact GPS point are placeholders (env `GYM_*`) — confirm with the owner.
- Pushing needs the SSH key loaded (`ssh-add --apple-use-keychain ~/.ssh/id_rsa`).
- Logout does not yet remove the device's Expo push token.

## Skills and workflows in this repo
Skills (`.claude/skills/`): meliora-run-stack, meliora-git-workflow, meliora-add-microservice,
meliora-door-integration, meliora-n8n-automation, frontend-design, webapp-testing.
Workflows (`.claude/workflows/`): `meliora-feature` (contract-first multi-agent delivery),
`meliora-review` (multi-angle review with adversarial verification).
