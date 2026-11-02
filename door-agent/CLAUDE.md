# Door agent

Runs on the gym LAN and opens doors for access-service; protocol in `../docs/API.md` (Door agents),
background in the meliora-door-integration skill. Drivers: ZKTeco (persistent TCP, own user-packet
builder because zkteco-js truncates RFID numbers), HTTP relay, simulator.

- `npm run dev` (needs `.env` with SERVER_URL + AGENT_KEY), `npm run mock-server` to test without
  hardware, `npm test`, `npm run build`.
- Never block the event loop in drivers: one ZK command at a time through the queue, always answer
  `door.open` acks (even on error) so the server does not wait 8 s.
- Punches are buffered on disk (`DATA_DIR`) while offline — keep the buffer format backward compatible.
- Tests (`node:test` through tsx, `test/*.test.ts`) run headless on 127.0.0.1 only: a fake ZKTeco
  TCP terminal, a local relay server and a fake access-service live in `test/helpers/`. Typecheck
  them with `npx tsc -p test/tsconfig.json`. Tests marked `todo` pin known bugs — drop the `todo`
  when fixing one so it guards the fix.
