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
| `SERVER_URL` | — (required) | Website URL (its nginx forwards `/agent-socket` to the gateway), e.g. `https://meliora-gym.tn` or, on the LAN, `http://192.168.1.10:8080`. With docker-compose the gateway port 4000 only listens on the server itself (the compose `door-agent` service uses `http://api-gateway:4000`); `http://<host>:4000` works against a backend started with `npm start` |
| `AGENT_KEY` | — (required) | Agent API key from the admin |
| `DEFAULT_DOOR_ID` | – | Door for QR codes read locally without a door id (optional with a single door) |
| `LOCAL_SCAN_PORT` / `LOCAL_SCAN_HOST` | `0` (off) / `0.0.0.0` | Local `POST /scan` + `GET /health` endpoint |
| `LOCAL_SCAN_TOKEN` | – | Required `x-scan-token` header for `/scan` |
| `SCAN_STDIN` | `true` | Read QR codes typed on stdin (USB keyboard-wedge scanner) |
| `SYNC_INTERVAL_SECONDS` | `300` | Member list push to ZKTeco terminals |
| `INACTIVE_POLICY` | `disable` | `disable` keeps expired members (and fingerprints) but blocks them; `delete` removes them |
| `HEARTBEAT_SECONDS` | `30` | Status report period |
| `ZK_TIMEOUT_MS` / `ZK_KEEPALIVE_SECONDS` / `ZK_UDP_INPORT` | `5000` / `60` / `5200` | ZKTeco connection tuning |
| `DATA_DIR` / `EVENT_BUFFER_MAX` | `./data` / `5000` | Punches waiting for the server (kept across restarts) |
| `LOG_LEVEL` / `LOG_FORMAT` | `info` / `auto` | `auto` = readable in a terminal, JSON lines otherwise |
| `TZ` | system | Keep `Africa/Tunis`: terminals report punches in local time |

## Door drivers (`config` of a door, set in the admin)

**ZKTECO** — standalone terminals with the TCP SDK (F22, MA300, SpeedFace-V5L, ProFace X, K40…) or
inBio panels.

```json
{ "ip": "192.168.1.201", "port": 4370, "timeoutMs": 5000, "punchMethod": "CARD", "syncUsers": true, "realtime": true }
```

- `punchMethod`: `CARD` or `FINGERPRINT` — how live punches are reported (zkteco-js does not decode the verify mode).
- `syncUsers: false` for an exit-only reader; `realtime: false` to stop forwarding punches.
- Members are written with PIN = their `deviceUid` (shown in the member file). Users created by hand
  on the terminal (staff, admin) are never modified.
- The terminal **Comm Key must be 0** (zkteco-js does not support a communication password): isolate
  the terminals on their own VLAN instead.

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

## Troubleshooting

| Log | Check |
|---|---|
| `cannot reach access-service … Invalid agent key` | `AGENT_KEY` (recreate the agent in the admin if lost) |
| `terminal unreachable` | terminal IP/port (`4370`), same LAN/VLAN, Comm Key = 0, only one SDK client at a time |
| `relay answered HTTP 401` | relay credentials (`basicAuth`) |
| punch times shifted by 1 h | terminal clock and `TZ=Africa/Tunis` on the agent |

`GET http://<agent>:8787/health` shows the connection, each door status, pending punches and the last member sync.

## Development

```bash
npm test            # unit tests (unlock payload, user packets, event buffer, config, relay)
npm run typecheck
npm run mock-server # fake access-service + Shelly relay + ZKTeco terminal, prints PASS/FAIL checks
```
