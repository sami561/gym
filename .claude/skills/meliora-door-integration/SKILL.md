---
name: meliora-door-integration
description: How Meliora's automatic door opening works and how to change it — rotating QR pass, app opening with geofence, ZKTeco badge/fingerprint terminals, HTTP relays (Shelly/ESP32), the on-premises door agent and its Socket.IO protocol. Use for anything about doors, access control, turnstiles, check-ins, QR codes, RFID cards, ZKTeco, relays, the door agent or "la porte ne s'ouvre pas", even when the user just says "the door".
---

# Door access at Meliora

## Who decides, who opens
- **access-service** decides (member active today? QR valid and not replayed? phone within
  `GEOFENCE_METERS` of the gym?) and logs every attempt (`access.logged` → live feed + class check-in).
- **door-agent** (on the gym LAN, outbound connection to the gateway `/agent-socket`) drives the
  hardware and acknowledges each `door.open`. Doors without an agent: SIMULATOR opens, HTTP_RELAY is
  called by access-service directly, ZKTECO is refused (needs an agent).
- Membership changes reach access-service as `member.entitlement-changed` events plus a 10-minute
  reconciliation, so doors keep working if membership-service is down.

## QR pass (mobile ↔ access-service)
`MLR1.<memberCode>.<step>.<sig>`, `step = floor(unix/30)`, `sig = hex(HMAC-SHA256(secret,
"<memberCode>.<step>"))[0..32]`. The app computes it offline from `GET /api/me/access-key`.
Accepted within ±1 step, each step usable once. `backend/libs/common/src/utils/access-code.ts` and
`mobile/src/lib/accessCode.ts` must stay byte-for-byte compatible — change both or neither.

## Agent protocol
Documented in `docs/API.md` ("Door agents"): `doors`, `door.open` (+ack), `qr.scanned`,
`device.events`, `members.sync`, `heartbeat`. Agent keys are created in the back-office
(Accès → Contrôleurs), shown once, stored hashed.

## ZKTeco specifics (door-agent)
Unlock = `CMD_UNLOCK` (31) with uint32 LE seconds×10. Users are synced every 5 min with
`deviceUid` as PIN and the full RFID number (the agent builds the user packet itself because
zkteco-js truncates cards to 16 bits); expired members are disabled, not deleted, so fingerprints
survive renewal. Punch method per door (`punchMethod`). Terminals need Comm Key 0.

## Testing without hardware
- `door-agent`: `npm run mock-server` (fake access-service + Shelly + ZKTeco) then `npm run dev`.
- Backend only: create a SIMULATOR door, then `POST /api/doors/:id/open`, `POST /api/access/scan`.
- Real hardware: test the relay alone first, then through the agent, then from the app.

## Safety
Follow the wiring section of `door-agent/README.md`: separate 12 V supply, exit button and
fail-safe locks on escape routes (fire regulations), never power a maglock from the relay board.
Never widen `GEOFENCE_METERS` or disable anti-replay to "fix" a door — find the real cause in the
access logs (reason column).
