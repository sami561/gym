# Backend (NestJS microservices)

Layout: `apps/<app>/src` (api-gateway + 10 services) and `libs/common/src` imported as `@app/common`.
Each service: `main.ts` (`bootstrapService(AppModule, '<name>')`; access-service is hybrid because it
also serves the door-agent socket on :4004), `app.module.ts` (`databaseModule('<prefix>')`,
`TypeOrmModule.forFeature`, `BusModule.forRoot()`), and `<domain>/<domain>.{entity,service,controller}.ts`.

## Conventions
- Controllers stay thin: `@MessagePattern(PATTERNS…)` / `@EventPattern(EVENTS…)` + `@Payload()` typed by
  the contract. Logic and SQL live in services; pure rules in small files with `*.spec.ts` next to them.
- Map entities to DTOs explicitly; never return secrets (`accessSecret`, `passwordHash`, `keyHash`).
  Door `config` is `{}` unless the caller edits doors (ADMIN), and then masked (`maskDoorConfig`,
  `DOOR_SECRET_MASK`); only door agents get the real config. Error text from a device or a remote server
  goes to the service log; callers get a short French summary.
- Server-side fetch of a configurable URL (workflow automations and door relays do it;
  notification-service webhooks and Expo push not yet): `parseOutboundUrl` when the URL is saved, then
  right before each request `parseOutboundUrl` + `assertOutboundAllowed(url, policy)` on the final URL,
  `fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(…) })`, and any 3xx is a failure. Trust
  destinations through the policy (`allowHosts` from `hostsFromUrls(<env URL>)` / `csvEnv(…)`,
  `allowPrivateCidrs`), never by skipping the check.
- Config: every `main.ts` calls `loadEnv()` first (directly or through `bootstrapService`); read values
  with `env()`, `envInt()`, `envBool()`, `csvEnv()`. With `NODE_ENV=production`, `loadEnv()` runs
  `assertSecureConfig` and the process refuses example, weak or reused secrets. A new secret env var
  (name with SECRET, PASSWORD, TOKEN or KEY) goes into `SECRETS` in `libs/common/src/config/secure-config.ts`
  (its spec fails otherwise) and into both `.env.example` files.
- `decimalTransformer` on numeric columns, `timestamptz` for instants, `date` for gym-calendar days.
- Event handlers are idempotent and tolerate out-of-order delivery (unique keys, upserts, retries).
- Cross-service reads that are optional degrade gracefully (`.catch(() => null)` / placeholder names).
- Gateway: class-validator DTOs (Swagger plugin documents them), `@Roles`, `@Public`, `@ApiKeyAuth`,
  `ParseUUIDPipe`, `toActor(user)`; query booleans via `ToBoolean()`. Global guards only act on HTTP and
  run in registration order: `AuthGuard`, then `HttpThrottlerGuard` (per user when signed in, per IP on
  `@Public` / `@ApiKeyAuth` routes; `@Throttle` for tighter limits). Fields the services trust (`actor`,
  `forUser`, `clientIp`, `includeConfig`, `includeContext`) come from the token or request, written after
  the DTO spread, never from the body.

## Checks
```bash
npx tsc --noEmit -p libs/common/tsconfig.lib.json
npx tsc --noEmit -p apps/<app>/tsconfig.app.json
npx jest apps/<app>
npm run lint                  # ESLint, type-aware: 0 errors (no-floating-promises, no-misused-promises…)
npx nest build <app>          # webpack; unchanged bundles keep their old mtime
npm run build && npm start    # all apps; then curl localhost:4000/api/health
```
`npm run rpc -- <pattern> '<json>'` calls a service directly (add `--emit` for events) — the quickest way
to tell a service bug from a gateway bug. Logs: run `node dist/apps/<app>/main.js` on its own.

## Databases
`meliora_<auth|membership|class|access|notification|staff|facility|commerce|training|workflow>`,
created by `npm run db:create`. Tables are synchronised from entities (`DB_SYNCHRONIZE`); default data is
seeded by the services on boot (admin user, rooms, exercises, workflow templates) and demo data by
`npm run seed`. With `NODE_ENV=production` the admin user needs `ADMIN_PASSWORD` (auth-service stops at
boot without it while no admin exists).
