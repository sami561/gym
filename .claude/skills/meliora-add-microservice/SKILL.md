---
name: meliora-add-microservice
description: Contract-first recipe to add a feature or a whole new NestJS microservice to the Meliora backend — shared contracts in libs/common, message patterns and events, database per service, gateway routes, Docker, docs and tests. Use it for any backend change in this repo ("add a feature", "new endpoint", "new module like X", "the dashboard needs Y", "add an event for n8n"), including small ones, so the gateway, services, web and mobile stay in sync.
---

# Adding to the Meliora backend

Architecture in one line: clients → **api-gateway** (HTTP, JWT, roles, validation, Swagger) →
message bus (`RpcClient.send` for request/response, `EventBus.publish` for fan-out events) →
one NestJS app per bounded context, each with **its own Postgres database** (TypeORM).
Services never read another service's database; they call its patterns or keep a read model fed
by its events (see access-service ← membership entitlements).

## 1. Contracts first (`backend/libs/common/src`)
- Types in `contracts/<domain>.contracts.ts` (exported from `contracts/index.ts`): request and
  DTO interfaces, enums. Dates are ISO strings, date-only `YYYY-MM-DD`, money a `number` in TND.
- Pattern names in `bus/patterns.ts` (`'<domain>.<action>'`, one owner per pattern).
- Domain events in `bus/events.ts`: name in `EVENTS`, payload interface in `EventPayloads`; add it
  to `WEBHOOK_EVENTS` if n8n should receive it (notification-service forwards that list).
- Then `npx tsc --noEmit -p libs/common/tsconfig.lib.json`. Everything else compiles against these.

## 2. Service code
`apps/<svc>/src/<domain>/<domain>.{entity,service,controller}.ts`:
- Controllers: `@MessagePattern(PATTERNS.x.y)` / `@EventPattern(EVENTS.z)` with `@Payload()` typed
  by the contract; thin — logic lives in services.
- Throw Nest HttpExceptions with **French** messages (`NotFoundException('Membre introuvable.')`);
  `AllRpcExceptionsFilter` sends `{ statusCode, message }` back and the gateway re-raises it.
- Map entities to DTOs explicitly (never return secrets or entities). `decimalTransformer` for
  numeric columns, `timestamptz` for instants, `date` for calendar days (gym timezone).
- Cross-service calls: `RpcClient.send<T>(PATTERNS…, payload)`; treat failures of optional data
  gracefully. Event handlers must be idempotent (events can repeat or arrive out of order).
- Unit-test pure rules in `*.spec.ts` next to them (`npx jest apps/<svc>`).

## 3. A brand-new service also needs
- `apps/<svc>/tsconfig.app.json` (copy another), a project entry in `nest-cli.json`, `main.ts`
  with `bootstrapService(AppModule, '<svc>')`, `databaseModule('<prefix>')` + `BusModule.forRoot()`.
- `package.json` build/dev/start lists, `scripts/create-databases.js` SERVICES list,
  `docker-compose.yml` service + `POSTGRES_MULTIPLE_DATABASES`, a `<svc>.health` pattern added to
  the gateway `HealthController`.

## 4. Gateway routes (`apps/api-gateway/src`)
Thin controllers with class-validator DTOs (the Swagger plugin documents them), `@Roles(...)`
(ADMIN / STAFF / COACH / MEMBER), `ParseUUIDPipe` on ids, `toActor(user)` when the contract has
an `actor`, `@Public()` for the website, `@ApiKeyAuth()` for n8n feeds. Member self-service lives
under `/api/me` and always uses the token's user id, never an id from the body. Query booleans use
`ToBoolean()` from `common/query.ts`.

## 5. Docs and verification
Document the endpoints in `docs/API.md` (web/mobile/n8n read it). Then build the app
(`npx nest build <app>`), start the stack and exercise it through the gateway — at least one
success path, one validation error and one permission error. Commit per the git skill.
