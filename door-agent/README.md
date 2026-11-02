# Meliora Gym — door agent

Small Node.js service that runs **inside the gym** (Raspberry Pi, mini-PC or the reception PC) and
drives the doors. It opens one outbound connection to the access-service, so nothing on the gym
network has to be exposed to the internet.

```
 Member app ──(QR / "Ouvrir la porte")──┐
 Reception kiosk (QR scan) ─────────────┤
                                        ▼
                     website ──► API gateway ──► access-service
                                        ▲          (decides: membership valid? Wi-Fi? geofence?)
           wss  /agent-socket  /agents  │
 ┌──────────────────────── gym LAN ─────┼───────────────────────────────────────┐
 │                                      │                                       │
 │                              ┌───────┴───────┐   USB QR scanner (stdin)       │
 │                              │  door agent   │◄─ ESP32 QR reader (POST /scan) │
 │                              └──┬────┬────┬──┘                                │
 │            TCP 4370 (ZK SDK)    │    │    │ HTTP                              │
 │        ┌────────────────────────┘    │    └──────────────┐                    │
 │        ▼                             ▼                   ▼                    │
 │  ZKTeco terminal / inBio      Shelly relay           ESP32 relay              │
 │  (badge, fingerprint, relay)  (dry contact)          (custom firmware)        │
 │        │                             │                   │                    │
 │        └──────── lock: maglock / electric strike / turnstile ──────────────────┘
 └───────────────────────────────────────────────────────────────────────────────┘
```

What it does:

- receives its door list (`doors`) and opening commands (`door.open`) from the server and answers
  each command with `{ ok, error? }`;
- **ZKTeco**: keeps a persistent connection (automatic reconnect, keep-alive, one command at a time),
  unlocks with `CMD_UNLOCK`, mirrors the member list on the terminal every 5 min (active members
  enrolled with their badge number, expired and deleted members **disabled** so their fingerprints are
  kept; the server only sends the list to an agent with an active ZKTeco door whose `syncUsers` is on),
  and forwards badge/fingerprint punches to the server (`device.events`), buffered on disk while offline;
- **HTTP relay**: calls any relay with an HTTP API (Shelly, ESP32, Tasmota…);
- **local QR readers**: a USB scanner typing into the agent's terminal, or network readers posting to
  `POST /scan` — the code is checked by the server (`qr.scanned`), which then opens the door;
- sends a `heartbeat` every 30 s so the admin shows each door online/offline.

The protocol is documented in [`docs/API.md`](../docs/API.md) ("Door agents" and "Rotating QR access code").

## Quick start

```bash
cd door-agent
npm install
cp .env.example .env     # set SERVER_URL and AGENT_KEY
npm run dev              # watch mode (tsx)
# production
npm run build && npm start
```

1. In the admin (Accès → Agents) create an agent: the API key is shown **once** → `AGENT_KEY`.
2. Create the doors (Accès → Portes), choose the driver, fill its configuration and assign them to the agent.
3. Start the agent: the doors show up as online in the admin; use "Ouvrir" to test.

Try it without the backend (fake access-service, Shelly relay and ZKTeco terminal):

```bash
npm run mock-server                                   # terminal 1
SERVER_URL=http://127.0.0.1:4999 AGENT_KEY=dev-agent-key-0123456789 \
  LOCAL_SCAN_PORT=8787 DEFAULT_DOOR_ID=door-sim npm run dev   # terminal 2
curl -X POST localhost:8787/scan -d 'MLR1.MEL-00001.1.0123456789abcdef0123456789abcdef'
```

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `SERVER_URL` | — (required) | The website, whose nginx forwards `/agent-socket` to the gateway: the public HTTPS URL (e.g. `https://meliora-gym.tn`) or, on the LAN, the web container `http://<server>:8080` (e.g. `http://192.168.1.10:8080`). In Docker deployments the gateway port 4000 only listens on 127.0.0.1, so `http://<server>:4000` cannot be reached from the gym (only the compose `door-agent` service, on the Docker network, uses `http://api-gateway:4000`). Local development: `http://localhost:4000` (backend started with `npm start`) |
| `AGENT_KEY` | — (required) | Agent API key from the admin |
| `DEFAULT_DOOR_ID` | – | Door for QR codes read locally without a door id (optional with a single door) |
| `LOCAL_SCAN_PORT` / `LOCAL_SCAN_HOST` | `0` (off) / `0.0.0.0` | Local `POST /scan` + `GET /health` endpoint |
| `LOCAL_SCAN_TOKEN` | – | Required `x-scan-token` header for `/scan` |
| `SCAN_STDIN` | `true` | Read QR codes typed on stdin (USB keyboard-wedge scanner) |
| `SYNC_INTERVAL_SECONDS` | `300` | Member list push to ZKTeco terminals |
| `INACTIVE_POLICY` | `disable` | `disable` keeps expired members (and fingerprints) but blocks them; `delete` removes them |
| `HEARTBEAT_SECONDS` | `30` | Status report period |
| `ZK_TIMEOUT_MS` | `5000` | ZKTeco command timeout, 2000–60000 ms: below 2000 the agent refuses to start (zkteco-js needs more than 1 s to read the user list). A door's `config.timeoutMs` replaces it for that door; below 2000 it is ignored with the warning `ignoring config.timeoutMs` |
| `ZK_KEEPALIVE_SECONDS` / `ZK_UDP_INPORT` | `60` / `5200` | ZKTeco connection tuning |
| `DATA_DIR` / `EVENT_BUFFER_MAX` | `./data` / `5000` | Punches waiting for the server (at most `EVENT_BUFFER_MAX`) and, per ZKTeco door, the terminal users the agent manages (`zkteco-users-<doorId>.json`). Must persist across restarts and updates (Docker: the `/data` volume) |
| `LOG_LEVEL` / `LOG_FORMAT` | `info` / `auto` | `auto` = readable in a terminal, JSON lines otherwise |
| `TZ` | system | Keep `Africa/Tunis`: terminals report punches in local time |

## Door drivers (`config` of a door, set in the admin)

**ZKTECO** — standalone terminals with the TCP SDK (F22, MA300, SpeedFace-V5L, ProFace X, K40…) or
inBio panels.

```json
{ "ip": "192.168.1.201", "port": 4370, "timeoutMs": 5000, "punchMethod": "CARD", "syncUsers": true, "realtime": true }
```

- `timeoutMs` (default `ZK_TIMEOUT_MS`): at least 2000 — a smaller value is ignored with the warning
  `ignoring config.timeoutMs` and `ZK_TIMEOUT_MS` is used instead.
- `punchMethod`: `CARD` or `FINGERPRINT` — how live punches are reported (the agent does not decode the verify mode).
- `syncUsers: false` for an exit-only reader; `realtime: false` to stop forwarding punches.
- The agent needs the terminal's TCP SDK for everything, member sync included: it reads the terminal's
  answers and user list itself. A terminal that only answers over UDP stays offline
  (`terminal unreachable`, error `no TCP connection`).
- The terminal **Comm Key must be 0** (zkteco-js does not support a communication password): isolate
  the terminals on their own VLAN instead.
- Member sync: members are written with PIN = their `deviceUid` (shown in the member file), their
  terminal name (ASCII only: accents removed, 24 characters at most) and their badge number.
  - The agent records the users it creates in `DATA_DIR/zkteco-users-<doorId>.json` (versioned) and
    only changes those. A plain user found at a member's PIN with that member's exact terminal name or
    badge number (enrolled by hand for that member, or written by an earlier version of the agent) is
    taken over (`terminal users recognised as members, now kept in sync`). Administrators, enrollers
    and managers are never touched.
  - A member whose PIN belongs to a terminal user the agent does not manage is skipped with the warning
    `members skipped: their PIN belongs to a terminal user the agent does not manage` (`users`: PIN,
    name and `admin` of each such user). Fix: renumber or delete that user on the terminal; the next
    sync enrols the member.
  - Terminals synced by an earlier version may hold administrators that version already overwrote with
    a member's name and badge (it kept their privilege): they appear in that warning with `admin: true`
    and must be fixed by hand (re-create the administrator under another PIN with its own name and
    badge, then delete the overwritten user).
  - `DATA_DIR` must persist (a Docker volume, see [Deployment](#deployment)): it holds this list and
    the punch buffer. While the list cannot be saved, no new member is enrolled. Deleting the list is
    safe — the next sync rebuilds it from names and badges — but members renamed since their last sync
    and without a badge are then skipped until fixed (rename that terminal user to the member's current
    name, or delete it so the agent enrols the member again, fingerprints to be re-enrolled).
  - The whole user list is read before any change: a list cut short fails that sync without writing
    anything (`member sync failed on terminal`, `Incomplete user list from the terminal`); the agent
    reconnects and syncs again.

**HTTP_RELAY** — any relay with an HTTP API. `{seconds}`, `{ms}` and `{doorId}` are replaced.

```jsonc
// Shelly Plus 1 / Shelly 1 Gen2 (auto-off after the unlock time)
{ "url": "http://192.168.1.50/rpc/Switch.Set?id=0&on=true&toggle_after={seconds}" }

// Shelly with authentication enabled
{ "url": "http://192.168.1.50/rpc/Switch.Set?id=0&on=true&toggle_after={seconds}",
  "basicAuth": { "username": "admin", "password": "…" } }

// ESP32 / custom firmware
{ "url": "http://192.168.1.60/open", "method": "POST",
  "headers": { "X-Token": "…" }, "body": { "seconds": "{seconds}" }, "timeoutMs": 3000 }
```

The admin checks a relay config when it is saved (http or https URL without `user:password@`, use
`basicAuth`; method GET, POST or PUT; at most 20 headers; `timeoutMs` 500–30000) and shows its secrets
(header values, passwords, tokens) as `********`; the agent still receives the real values.
Older configs with `user:password@` in the URL keep working: the agent takes the credentials out of the
URL, sends them as Basic auth and masks the password in its logs (`user:***@`). `basicAuth`, then an
explicit `Authorization` header, take precedence over them. Header names are case-insensitive:
`authorization` is the same header as `Authorization` (`basicAuth` replaces it, never sends both), and a
JSON body keeps a configured `content-type`.

**SIMULATOR** — `{}`: logs the opening. For demos and doors not wired yet.

## How a member gets in

| Way in | Who decides | Needs the internet? |
|---|---|---|
| Badge / fingerprint on the ZKTeco terminal | the terminal (members enrolled by the sync; expired ones disabled) | no — punches are sent later |
| QR code from the app, read by a local scanner | access-service (`qr.scanned`) | yes |
| "Ouvrir la porte" in the app (doors that allow it; gym Wi-Fi if configured, geofence) | access-service → `door.open` | yes |
| Reception: scan in the admin, or manual "Ouvrir" | access-service → `door.open` | yes |

When the server is unreachable, QR codes are refused with a message asking to use the badge or
reception; badges and fingerprints keep working.

## Wiring

> Electrical work on doors must follow fire-safety rules: escape doors need **fail-safe** locks and a
> green break-glass unit cutting the lock power. Have it installed by a qualified electrician.

**ZKTeco terminal with its built-in lock relay** (F22, SpeedFace, MA300…):

```
            12 V DC PSU (with backup battery)
             +12V ─────────────────┬───────────────────────────┐
             GND ──┬───────────────┼──────────┐                │
                   │               │          │                │
          ┌────────┴─────────┐     │          │      ┌─────────┴──────────┐
          │  ZKTeco terminal │     │          │      │ Break-glass (NC)   │
          │  +12V  GND       │◄────┘          │      └─────────┬──────────┘
          │  NO  COM  NC     │                │                │
          │  BUT  GND        │◄── exit button │                │
          │  SEN  GND        │◄── door sensor │                │
          └──┬────┬────┬─────┘                │                │
             │    │    │                      │                │
 fail-secure │    │    │ fail-safe            │                │
 (strike)    │    │    │ (maglock)            │                │
   NO ───────┘    │    └────── NC             │                │
                  COM ◄────────────────────────────────────────┘ (+12V through break-glass)

 Electric strike (fail-secure, locked without power):  +12V → COM, NO → strike(+), strike(−) → GND
 Maglock (fail-safe, open without power):              +12V → COM, NC → maglock(+), maglock(−) → GND
 Add a 1N4007 diode across DC lock coils (cathode to +) unless the lock has one built in.
```

**Shelly relay** (dry contact, 230 V or 12 V powered model):

```
 Lock PSU +12V ──► Shelly O/I (COM) ── Shelly relay ──► lock (+)      (strike: contact closes to open)
 Lock PSU GND  ─────────────────────────────────────► lock (−)
 Maglock: use a relay with an NC contact (or a Shelly driving an NC interposing relay).
 Exit button: wire it to the lock controller / Shelly SW input, not to the agent.
```

**inBio panel**: lock on `Lock1` (NO/COM/NC as above), readers on the Wiegand ports, exit button on
`BUT1`, sensor on `SEN1`; the agent talks to the panel over TCP like a terminal.

## Local QR readers

- **USB keyboard-wedge scanner**: plug it into the PC running the agent in a terminal (`SCAN_STDIN=true`,
  e.g. a Raspberry Pi console with autologin). Each scan is a line on stdin.
- **Network reader** (ESP32 + GM65/GM805 module, Wiegand-to-HTTP bridge): `POST /scan` with
  `{"code": "...", "doorId": "optional"}` or the raw code as `text/plain`, header `x-scan-token`.
  Answers `200` (granted), `403` (refused, `reason` in the body), `401` (token), `400` (bad request).
  Show green/red on the reader from the status code:

```cpp
// ESP32 (Arduino): forward a scanned QR code to the agent
HTTPClient http;
http.begin("http://192.168.1.10:8787/scan");
http.addHeader("Content-Type", "application/json");
http.addHeader("x-scan-token", SCAN_TOKEN);
int status = http.POST("{\"code\":\"" + code + "\"}");
digitalWrite(status == 200 ? LED_GREEN : LED_RED, HIGH);
http.end();
```

## Deployment

**Raspberry Pi / Linux with systemd**

```bash
sudo useradd --system --home /opt/meliora meliora
sudo mkdir -p /opt/meliora/door-agent && sudo chown -R meliora: /opt/meliora
# copy the project, then as meliora:
npm ci && npm run build && cp .env.example .env && nano .env && mkdir -p data
sudo cp deploy/meliora-door-agent.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now meliora-door-agent
journalctl -u meliora-door-agent -f
```

**pm2**: `npm run build && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup`

**Docker** (host network so the agent reaches the LAN devices and exposes `/scan`):

```bash
docker build -t meliora-door-agent .
docker run -d --name door-agent --restart=always --network host \
  --env-file .env -v meliora-door-data:/data meliora-door-agent
```

The image keeps `DATA_DIR` on the `/data` volume (punch buffer, managed terminal users): keep that
volume across updates and leave `DATA_DIR` unset in this `.env` — a relative path such as `./data`
would point into the image's application folder, which the agent (user `node`) cannot write, and the
agent would stop at start-up.

## Troubleshooting

| Log | Check |
|---|---|
| `cannot reach access-service … Clé agent invalide.` | `AGENT_KEY` (recreate the agent in the admin if lost) |
| `terminal unreachable` | terminal IP/port (`4370`), same LAN/VLAN, Comm Key = 0, only one SDK client at a time; error `no TCP connection`: the terminal's TCP SDK |
| `members skipped: their PIN belongs to a terminal user the agent does not manage` | each entry of `users` (`deviceUserId` = PIN, `name`, `admin`) is a terminal user holding a member's PIN that the agent does not manage: renumber or delete it on the terminal (the next sync enrols the member). `admin: true` on a terminal synced by an earlier version can be an administrator that version overwrote with a member: fix it by hand (Door drivers → ZKTECO) |
| `terminal refused member changes` | the terminal answered an error (`reply`) to each entry of `changes` (`deviceUserId`, `change`), e.g. it is full: those members are skipped, the others still sync |
| `managed terminal users unreadable, rebuilding the list` | `DATA_DIR/zkteco-users-<doorId>.json` is damaged or written by a newer agent version: the list is rebuilt from names and badges; members renamed without a badge are then skipped until fixed (Door drivers → ZKTECO) |
| `door open failed … Relay answered HTTP 401` | relay credentials (`basicAuth`) |
| punch times shifted by 1 h | terminal clock and `TZ=Africa/Tunis` on the agent |

`GET http://<agent>:8787/health` shows the connection, each door status, pending punches and the last member sync.

## Development

```bash
npm test            # unit tests (unlock payload, user packets, event buffer, config, relay)
npm run typecheck
npm run mock-server # fake access-service + Shelly relay + ZKTeco terminal, prints PASS/FAIL checks
```
