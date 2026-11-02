# Backend (NestJS microservices)

Layout: `apps/<app>/src` (api-gateway + 10 services) and `libs/common/src` imported as `@app/common`.
Each service: `main.ts` (`bootstrapService(AppModule, '<name>')`; access-service is hybrid because it
also serves the door-agent socket on :4004), `app.module.ts` (`databaseModule('<prefix>')`,
`TypeOrmModule.forFeature`, `BusModule.forRoot()`), and `<domain>/<domain>.{entity,service,controller}.ts`.

## Conventions
- Controllers stay thin: `@MessagePattern(PATTERNS…)` / `@EventPattern(EVENTS…)` + `@Payload()` typed by
  the contract. Logic and SQL live in services; pure rules in small files with `*.spec.ts` next to them.
- Map entities to DTOs explicitly; never return secrets (`accessSecret`, `passwordHash`, `keyHash`).
- `decimalTransformer` on numeric columns, `timestamptz` for instants, `date` for gym-calendar days.
- Event handlers are idempotent and tolerate out-of-order delivery (unique keys, upserts, retries).
- Cross-service reads that are optional degrade gracefully (`.catch(() => null)` / placeholder names).
- Gateway: class-validator DTOs (Swagger plugin documents them), `@Roles`, `@Public`, `@ApiKeyAuth`,
  `ParseUUIDPipe`, `toActor(user)`; query booleans via `ToBoolean()`. Global guards only act on HTTP.

## Checks
```bash
npx tsc --noEmit -p libs/common/tsconfig.lib.json
npx tsc --noEmit -p apps/<app>/tsconfig.app.json
npx jest apps/<app>
npx nest build <app>          # webpack; unchanged bundles keep their old mtime
npm run build && npm start    # all apps; then curl localhost:4000/api/health
```
`npm run rpc -- <pattern> '<json>'` calls a service directly (add `--emit` for events) — the quickest way
to tell a service bug from a gateway bug. Logs: run `node dist/apps/<app>/main.js` on its own.

## Databases
`meliora_<auth|membership|class|access|notification|staff|facility|commerce|training|workflow>`,
created by `npm run db:create`. Tables are synchronised from entities (`DB_SYNCHRONIZE`); default data is
seeded by the services on boot (admin user, rooms, exercises, workflow templates) and demo data by
`npm run seed`.
