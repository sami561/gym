# Door agent

Runs on the gym LAN and opens doors for access-service; protocol in `../docs/API.md` (Door agents),
background in the meliora-door-integration skill. Drivers: ZKTeco (persistent TCP), HTTP relay, simulator.

- ZKTeco: zkteco-js opens the session, sends the commands and runs the keep-alive (`getTime`) and the
  user-list transfer (`readWithBuffer`). The agent has its own TCP packet reader (`ZkTcpReader`: punches
  split per packet; the answer to each command that changes the terminal — unlock, user write or
  delete, refresh, punch subscription — checked for CMD_ACK_OK) and its own 72-byte user record builder
  and decoder (zkteco-js truncates RFID numbers and reads 24-character names into the card number).
  ZK timeouts >= 2000 ms (`ZK_TIMEOUT_MIN_MS`).
- `npm run dev` (needs `.env` with SERVER_URL + AGENT_KEY), `npm run mock-server` to test without
  hardware, `npm test`, `npm run build`.
- Never block the event loop in drivers: one ZK command at a time through the queue, always answer
  `door.open` acks (even on error) so the server does not wait 8 s.
- `DATA_DIR` holds the punch buffer (while offline) and `zkteco-users-<doorId>.json` (versioned list of
  the terminal users the member sync may change) — keep both formats backward compatible.
- Tests (`node:test` through tsx, `test/*.test.ts`) run headless on 127.0.0.1 only: a fake ZKTeco
  TCP terminal, a local relay server and a fake access-service live in `test/helpers/`. Typecheck
  them with `npx tsc -p test/tsconfig.json`. Tests marked `todo` pin known bugs — drop the `todo`
  when fixing one so it guards the fix.
