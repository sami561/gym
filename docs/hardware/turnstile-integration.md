# Turnstiles and face terminals: integration guide

*3 November 2026. Built from five research reports (ZKTeco; Hikvision; Dahua and white-label terminals; turnstile boards and QR readers; the installer EDS), a fact-check and a completeness review, and the current door-agent code. **None of it has been tested on the gym's hardware.** "(medium)" and "(low)" mark confidence; "unconfirmed" means no reachable source supports it; claims without a mark are high confidence. Effort figures are estimates, not sourced.*

## In short (for the owner)

- **Which "SDK" applies depends on the brand and settings of the face terminals, so identify them first** (§1: 5 minutes on site, plus questions to EDS). The platform's door agent already speaks one of these protocols: ZKTeco's TCP 4370 SDK.
- **Probably ZKTeco** (medium). EDS's catalogues are mostly ZKTeco, but some models could not be identified, and its 2023 list has no visible-light face terminal ([2023 terminals][eds-pt], [2023 turnstiles][eds-ts], [shop][eds-shop]). The terminal may be an older ZKTeco model.
- **Recommended path** (§3):
  1. Identify, changing nothing.
  2. Fix the turnstile settings.
  3. On one lane, fit a network relay and a QR reader that sends the raw text. This gives remote opening and the rotating QR pass with any terminal, for 0–1 day of development plus hardware and an electrician.
  4. If the terminals are ZKTeco answering on TCP 4370, switch on the existing ZKTeco driver. It gives member and badge sync, expiry within 5 minutes, remote opening and live passages: 0 days to try, 2–4 to finish.
- **Faces from member photos, with expiry enforced by the terminal**, need a new driver for the confirmed brand: about **4–5 weeks** of one engineer plus lab tests on a spare terminal (§2.8). Do it only after an INPDP filing and a separate written consent from each member (§4.1).
- **Limits:**
  - No terminal checks the rotating QR on its own.
  - QR, app and admin opening stop when the internet is down; faces and badges keep working on the terminal. Fit a key switch at reception (§3).

---

## 1. What to check at the turnstile (owner)

### 1.1 The 5-minute check

Bring the terminal admin password (ask EDS), your phone with the Meliora app, and a camera. Photograph every label and screen.

> **Look, don't change.** On ZKTeco terminals, *Device Type Setting* and *Security Mode* erase all faces and badges, and *Standalone Communication* and *HTTPS* restart the device ([V4L Pro][v4lpro] and [V5L][v5l] manuals, [ZKTeco FAQ][zkfaq]). Change nothing until EDS has made a backup.

1. **Label** (back of the terminal or its pole):
   - "ZKTeco" (SpeedFace, ProFace X, eFace10, MB20, MultiBio…).
   - "HIKVISION DS-K1T…" ([example datasheet][hikbqr]).
   - "Dahua DHI-ASI…" ([example][dahua-asi]).
   - "Intelbras SS 3540 … FACE" is a Dahua inside ([rroller #296][rroller296]).
   - Any other name can still be ZKTeco inside: Smartec ST-FR041ME runs ZKTeco "ZAM170" firmware ([CVE record][cve3938]). Steps 2 and 6 decide, not the label.

   **QR**, **-QR** or **-BQR** in the model name means a built-in QR module ([V5L datasheet][v5lds], [Hikvision][hikbqr]). A plain SpeedFace-V5L can also read QR codes with its face camera.
2. **Information screen.**
   - ZKTeco: Menu > System Info > Device Info and Firmware Info. Note the firmware text; it is a hint only ("ZAM170/180-NF…" is Linux, "CoreService" is Android, [CVSecurity list][cvlist]).
   - Hikvision: System > Comm. > ISUP shows whether it is enabled and which server is set ([manual][hik670isup]).
   - Dahua: Main Menu > System Info ([manual][dahuaweb3]).
3. **ZKTeco only, four screens** ([V5L][v5l], [V4L Pro][v4lpro] manuals):
   - COMM > Cloud Server Setting: is a server address filled in? Is there a cloud icon on the standby screen?
   - System > Device Type Setting: T&A or A&C PUSH; PUSH or BEST.
   - System > Security Settings: Standalone Communication on or off; SSH.
   - COMM > Ethernet and PC Connection: IP, port (normally 4370), Comm Key (normally 0).
4. **Reception PC.** Which program manages members? EXPERTDEV-SPORT is EDS's; ZKBio or ZKAccess is ZKTeco's; iVMS-4200 or HikCentral is Hikvision; SmartPSS or DSS is Dahua.
5. **QR window.** Show the app's QR, then a QR holding only a badge number (any free QR website), then the app QR in front of the face camera. Note: beep, message, nothing, or opening.
   - If only the digits QR opens, the reader turns QR text into badge numbers, which cannot carry the pass.
   - No reaction does not prove there is no QR reader: some readers only pass hex digits over Wiegand ([S4A manual][s4a]).
6. **Network** (a laptop, or ask the developer):
   - `nc -vz <ip> 4370` succeeds: ZKTeco SDK over TCP. A failure is not conclusive, because older ZKTeco terminals answer over UDP only, which the agent can't use ([pyzk][pyzk]).
   - `curl -i http://<ip>/ISAPI/System/deviceInfo` answers 401 "Digest": Hikvision ([ISAPI guide][isapi]).
   - Port 37777: Dahua ([manual][dahuaweb3]). Port 51211: Suprema ([G-SDK][gsdk-connect]). Port 5010: Anviz (unconfirmed).

### 1.2 Questions for EDS (+216 29 580 682, contact@expert-dev-solutions.com)

1. Exact model and firmware of each face terminal and of the turnstile. Is there a panel inside (C2-260, C3, inBio)? Is the exit side controlled?
2. Which software manages members on the terminals (EXPERTDEV-SPORT, ZKBio, ZKAccess, Zlink)? Is it installed at Meliora? Does it block unpaid members, and by badge or by face? Its page says it blocks unpaid members but not how ([2020 page][eds-sport20]). Where is its data stored?
3. Is a cloud/ADMS server set? Was an ADMS or API licence bought?
4. IP, admin password and Comm Key of every device. Please create an admin account owned by Meliora.
5. Which relay is wired to the turnstile's open input (K1/K2 or Unlock A/B)? Or is it Wiegand / RS-485 into a board?
6. The round window: QR reader model? Wired by Wiegand, RS-485, USB or network? Can it send the raw text?
7. Badge technology (EM 125 kHz or MIFARE) and the number format on the terminals.
8. Is memory mode off? Is the relay time 1 s? Is the fire input wired? What do the arms do on a power cut? Is there an emergency or accessible gate?
9. A backup before any change, and about 2 h on site for tests. In writing: warranty if a relay is added, liability, cost, hand-over of credentials and licences, and confidentiality of member data ([loi 2004-63][loi] art. 18 and 23).

> Bonjour, pour relier nos tourniquets à notre plateforme Meliora, pouvez-vous nous donner : le modèle et le firmware exacts des terminaux visage et du tourniquet ; s'il y a une centrale (C2-260, C3, inBio) ; quel logiciel gère les adhérents sur les terminaux (EXPERTDEV-SPORT, ZKBio…) et s'il est installé chez nous ; si un serveur cloud/ADMS est configuré ; les adresses IP, le mot de passe admin et la Comm Key ; quel relais est câblé sur l'entrée « ouverture » du tourniquet ; ce qu'est la fenêtre ronde noire (lecteur QR ? modèle ? câblage Wiegand, RS-485, USB ou réseau ?) ; la technologie des badges (EM ou MIFARE). Pouvez-vous aussi vérifier que le mode « mémoire » est désactivé, que le temps de relais est à 1 seconde, et faire une sauvegarde des terminaux avant toute modification ? Merci.

---

## 2. Integration paths (engineers)

### 2.0 Which case, what each path can do, shared work

**Which case you have** (from §1). Firmware strings are hints only: "Ver 8.0.4.x" runs on push models ([CVSecurity list][cvlist]), and "Ver 6.60" also runs on visible-light SpeedFace units ([pyzk #170][pyzk170]). Only the §2.1 test proves case Z1.

| What was found | Case | Meaning | Read |
|---|---|---|---|
| ZKTeco (any label) answering on TCP 4370 with Comm Key 0, no cloud server set | **Z1** | Door agent works today, once the on-site test passes | §2.1 |
| ZKTeco "ZAM…" firmware with a cloud/ADMS server set | **Z2** | Run by push software. Either move it to 4370 with EDS, or build the push driver. On some ZAM firmware, 4370 gives the users but no punches, so prove punches on the unit ([pyzk #170][pyzk170]) | §2.1, §2.2 |
| ZKTeco Android ("CoreService") | **Z2a** | Push or CVSecurity only; 4370 not expected (confirm on the device) | §2.2, §2.3 |
| C2-260, inBio Pro or C3 Pro panel in the turnstile | **Z3** | A&C PUSH devices ([Axxon][axxon], [CV SDK guide][cvsdk]): the A&C push driver may cover them | §2.2 |
| Older C3 / inBio panel | **Z3b** | PullSDK. The open-source references read users and open doors but cannot write users ([pyzkaccess][pyzkaccess], [zkaccess-c3-py][c3py]) | §2.6 |
| Hikvision DS-K1T… | **H** | ISAPI driver | §2.4 |
| Dahua ASI… or a Dahua OEM | **D** | CGI driver | §2.5 |
| Managed by EXPERTDEV-SPORT, ZKBio, HikCentral / Hik-Connect, DSS / SmartPSS or Zlink | **P** | Decide which **one** system manages members first | shared work 7 |
| Turnstile with its own controller (Hikvision DS-K3G…, Dahua ASGG…) | **T** | Opening and events come from the turnstile controller | §2.4, §2.6 |
| Other brand, no admin password, or UDP-only ZKTeco | **R** | Relay and QR reader only | §2.6, §2.7 |

**What each path can do**

| Path | Members + expiry on the device | Face from the member photo | Live passages | Remote opening | Rotating QR | Agent today |
|---|---|---|---|---|---|---|
| ZKTeco TCP 4370 (§2.1) | PIN + badge; expired members disabled at the next sync (≤5 min) | No: staff enrol faces at the terminal | Live punches implemented, unconfirmed on face models; **no backfill** | CMD_UNLOCK, untested on face models | No | **Supported** (`ZKTECO`) |
| ZKTeco PUSH, T&A (§2.2) | Users + badge; no end-date field found | BIOPHOTO type 9, no real-device report | ATTLOG within seconds | `AC_UNLOCK` reported (low) | No | New driver |
| ZKTeco PUSH, A&C (§2.2) | Users with StartTime/EndTime on the device | Same | rtlog | `CONTROL DEVICE` (low) | No | New driver |
| ZKBio CVSecurity API (§2.3) | accStartTime / accEndTime | Base64 photo | Polling, ≥10 s | Yes | ZKTeco's own QR only | New driver + licence + server |
| Hikvision ISAPI (§2.4) | Valid begin/end, enforced offline | JPEG <200 KB | Push + log sweep | Yes; duration set on the terminal | Only via remote check, unproven | New driver |
| Dahua CGI (§2.5) | ValidFrom/ValidTo, UserStatus | JPEG (<100 KB per the guide) | Event stream + backfill | Yes | Pass-through, unproven | New driver |
| Relay only (§2.6) | No | No | Only with extra wiring | Yes | n/a | **Supported** (`HTTP_RELAY`) |
| Raw-text QR reader (§2.7) | n/a | n/a | QR scans | Through relay or terminal | **Yes** | USB: one lane per host. HTTP: small adapter. Serial/Wiegand: new |

**Shared work, once, before the first new driver** (follow the `meliora-add-microservice` recipe; 5–8 days, plus 4–6 days for the face package):

1. **Contracts and backend.**
   - `DoorDriverKind = 'ZKTECO' | 'HTTP_RELAY' | 'SIMULATOR'` gets `ZKTECO_PUSH`, `HIKVISION`, `DAHUA`.
   - `DeviceEventMethod = 'CARD' | 'FINGERPRINT'` gets `FACE` and `QR`. On the backend, `AccessMethod` (QR, APP, CARD, FINGERPRINT, MANUAL) has no FACE and is a Postgres enum column (`access_logs.method`): it needs a migration (don't rely on `DB_SYNCHRONIZE` in prod). `parseDeviceEvent` maps anything that is not FINGERPRINT to CARD, so face punches would be logged as CARD silently ([access.contracts.ts](../../backend/libs/common/src/contracts/access.contracts.ts), [device-sync.ts](../../backend/apps/access-service/src/agents/device-sync.ts), [access-log.entity.ts](../../backend/apps/access-service/src/logs/access-log.entity.ts)). Also update the web labels and dashboard stats.
   - `DeviceEvent` gets `result`, `reason` and `direction`. Today a refused face or badge never reaches `deniedToday`, and exit punches on a controlled exit count as check-ins. Map these per family: Hikvision minor codes, Dahua `Status`/`Type`, ZKTeco event and `inoutstatus`. Model each lane and direction as a door.
   - `DeviceUserSync = {deviceUid, name, cardNumber, active}` gets `validFrom`/`validUntil`, a photo reference (hash + fetch route), the face consent flag and an **erase-biometrics** state. Mapping rule from `checkMember` (status + paid date windows, [access-decision.ts](../../backend/apps/access-service/src/access/access-decision.ts)):
     - send the window covering today, merged with any windows that follow without a gap;
     - SUSPENDED means disabled, or an end in the past;
     - a future-only window means begin = its start date;
     - a date-only end becomes 23:59:59 Africa/Tunis.

     Device formats: Hikvision local ISO time, ZKTeco A&C YYYYMMDD (when `DateFmtFunOn=0`), Dahua `yyyy-MM-dd HH:mm:ss`.
   - `members.sync` only answers for active ZKTECO doors today ([API.md](../API.md) "Door agents"): extend it to the new kinds.
   - Files: `backend/libs/common/src/contracts/access.contracts.ts`, `backend/apps/access-service/src/agents/device-sync.ts` (+ spec), `door-agent/src/types/contracts.ts` (mirrored by hand), `door-agent/src/doors/driver.ts`, `door-agent/src/doors/registry.ts`, and `web/src/api/types.ts`, `web/src/lib/format.ts`, `web/src/admin/pages/AccessPage.tsx` (config forms, passwords masked).
2. **"Sync now".** Today a member who pays at reception waits up to `SYNC_INTERVAL_SECONDS` (300 s) before the terminal accepts them. Push a sync request to the agent on payment, renewal, suspension and deletion.
3. **Device-sized photo** (face package). Stored photos are 600×600 JPEGs of up to 512 KB, and the photo route needs a user's bearer token ([API.md](../API.md) "Member photos"). Add an agent-authenticated `GET /agents/members/:deviceUid/photo?maxBytes=…` that re-encodes on the server. Serve it only for members with consent and a staff-approved photo.

   | Family | Size | Framing | Source |
   |---|---|---|---|
   | ZKTeco visible-light | **≤20 KB JPG (stated requirement)**; larger is unverified | 358×441 to 1080×1920, portrait, head and shoulders, white background | [V5L manual][v5l] appendix |
   | Hikvision | <200 KB (USB import: 60–200 KB, ≥640×480) | no ISAPI minimum found | [DS-K1T606][hik606], [DS-K1T670][hik670photo] |
   | Dahua | <100 KB (the API allows 200 KB) | 150×300 to 600×1200, about 500×500, one face ≤2/3 of the frame | [Dahua integration instruction][dahuaint], [API 3.26][dahua326] |

   The square 600×600 photo does not match the ZKTeco portrait framing. Decide between a server-side crop/pad and a separate portrait shot taken at the desk.
4. **HTTP Digest helper** `door-agent/src/doors/digest-auth.ts`. Hikvision uses Digest MD5 ([ISAPI guide][isapi]), Dahua RFC 7616 ([API 3.26][dahua326] §3.4), Shelly Gen2+ SHA-256 ([Shelly auth][shellyauth]). `http-relay.ts` only sends Basic, and Node's `fetch` has no Digest. Retry once on a stale nonce and **never loop on a 401** (Hikvision is reported to lock the account after about 5 failures, [hikvision-best-practices][hikbp], unconfirmed).
5. **Routes for devices that push to the agent.** `door-agent/src/scan/http-scan-server.ts` serves only `GET /health` and `POST /scan` (512 characters max). Turn it into a small router, or add `door-agent/src/http/device-push-server.ts`, accepting bodies of a few hundred KB. **Authenticate every push**: per-device IP allowlist plus a secret in the path or HTTP auth. Never reachable from the internet.
6. **Turnstile settings, every path** ([TS2100 manual][ts2100], [Lenvica TS2000][lenvica]): pulse ≤1 s, so set `unlockSeconds = 1` on each turnstile door. The backend default is 5, and both the relay `{seconds}` and CMD_UNLOCK use it. Turn the board's "memory" DIP **off**, or a face plus a QR scan for one person credits two passages. Set the terminal's lock-relay time to 1 s and its door sensor to "None".
7. **One system manages members.** If EXPERTDEV-SPORT or ZKBio pushes members, turn that off or set `syncUsers: false` on the agent door. Every driver keeps a managed-ID file like [managed-users.ts](../../door-agent/src/doors/managed-users.ts), so it never touches users enrolled by EDS (staff, admins).
8. **Tests and docs.** Each new driver gets a fake device in `door-agent/test/helpers/` like `fake-zk-terminal.ts`, plus updates to `docs/API.md`, the door-agent README and the door skill.

---

### 2.1 ZKTeco standalone SDK, TCP 4370 (what the agent uses today)

*This is ZKTeco's "Standalone SDK". "PullSDK" is a different protocol, used by older C3/inBio panels.*

**Can**
- **Members:** PIN = `deviceUid`, name and badge, written as 72-byte CMD_USER_WRQ records every 5 minutes. Expired members are disabled with privilege bit 0 ([zkteco.ts](../../door-agent/src/doors/zkteco.ts), [zk-protocol.ts](../../door-agent/src/doors/zk-protocol.ts)). **Unconfirmed on face firmware:** no source shows that ZAM firmware honours the disabled flag for face verification.
- **Remote opening:** CMD_UNLOCK (31), 1–60 s.
- **Live passages:** CMD_REG_EVENT. **Unconfirmed on face models**: no report shows live punches on visible-light firmware ([pyzk #170][pyzk170]).

**Cannot**
- **Faces from the member photo.** The last Standalone SDK (6.3.1.37, 2018) has biometric types 0–8 and only near-infrared "IFACE" faces, with no visible-light type ([SDK manual V2.1][sdk21]). Staff enrol faces at the terminal under the member's PIN. "Not possible" is an inference (medium).
- **Expiry by the device clock:** blocking waits for the next sync, and stops entirely while the internet is down.
- **Punches made while the agent was disconnected** are not read back today: on reconnect the driver does not read the attendance log.
- **The rotating QR** (§2.7).

**Prerequisites on face terminals**
- "Standalone Communication" must be on. It is off by default, and turning it on restarts the device ([V5L manual][v5l], [ZKTeco FAQ][zkfaq]).
- Comm Key = 0. A non-zero key must be 6 digits on the V4L Pro ([V4L Pro manual][v4lpro]) and 1–6 digits on the V5L ([V5L manual][v5l]), and the agent cannot send any key, so any non-zero key blocks this path ([zkteco-js][zktecojs], [README](../../door-agent/README.md)).
- TCP. A UDP-only terminal stays offline in the agent.
- Device type: in A&C mode one SpeedFace (firmware "Ver 6.60") returned no attendance through pyzk. On ZAM180 firmware, users were readable but attendance failed ([pyzk #170][pyzk170]) (low). Changing the type wipes the device: back up first, with EDS's agreement.

**New work** (2–4 days, after the on-site test):
- Map the verify-mode byte to `FACE`. It sits at offset 24 of the live event and is ignored today ([zk-protocol.ts](../../door-agent/src/doors/zk-protocol.ts)). The FAQ gives 15 = face in AC-push records ([ZKTeco FAQ][zkfaq]); check what 4370 sends on the device.
- Read the attendance log after each reconnect, with a persisted cursor, deduplicated by (door, user, time). Some V5L firmware reportedly sends 49-byte records, and one reporter fixed garbled records with a firmware update ([pyzk #221][pyzk221], [pyzk #170][pyzk170]). Record size depends on firmware.
- Inactive policy: `INACTIVE_POLICY=disable` keeps face templates indefinitely, also for members deleted in the back-office (still listed as inactive "Membre supprimé", [API.md](../API.md)). Replace it with: disable during a short grace period, then delete; delete at once on member deletion or consent withdrawal (§4.2).

**Risks**
- zkteco-js says it is "not recommended for use in production" ([zkteco-js][zktecojs]). The agent already works around its card truncation and packet decoding.
- With Comm Key 0, anyone on the LAN can manage the terminal over 4370: network isolation is mandatory (§4.5).
- EDS's software writing users at the same time collides on the same PINs.

**On-site test** (on one terminal, after a backup): `nc -vz <ip> 4370`, then add a `ZKTECO` door `{ip, port: 4370, syncUsers, realtime}` and check:
- a test member is created;
- expiring them refuses their **face** and badge;
- `door.open` turns the arm;
- a face punch reaches `device.events`;
- a punch made while the agent is stopped shows what is lost.

---

### 2.2 ZKTeco PUSH / ADMS (the protocol ZKTeco builds face terminals around)

**How it works.** The terminal sends HTTP requests to the server set in COMM > Cloud Server Setting ([s0x90 notes, real SpeedFace-V5L][s0x90], [zk-push-server][zkpush]):
- `GET /iclock/cdata` handshake; the server's answer sets the poll interval and transfer options (zk-push-server sends `Delay=10`, `TransInterval=1`). One V5L polled every 3–8 s, which is an observation, not a constant.
- `GET /iclock/getrequest` returns `C:<id>:<command>`; results go to `/iclock/devicecmd`; punches arrive at `/iclock/cdata`.

Each terminal runs **either** T&A PUSH **or** A&C PUSH, set in System > Device Type Setting, and switching erases it ([V4L Pro manual][v4lpro]). ZKTeco sells the PUSH SDK as a paid licence with upgrade fees ([CV SDK guide][cvsdk]). The command text below comes from documents circulating outside ZKTeco and from open-source servers.

**Can**

| Need | T&A PUSH | A&C PUSH |
|---|---|---|
| Members | `DATA UPDATE USERINFO PIN=<pin>\tName=<name>\tPrivilege=0\tCard=<card>`, delete with `DATA DELETE USERINFO PIN=<pin>`. Confirmed on a SpeedFace-V5L-RFID[TI] (ZAM180-NF); `USER ADD`, `USER DEL` and `DATA DEL` return -1002 there ([s0x90][s0x90]) | `DATA UPDATE user CardNo=…\tPin=…\tName=…\tStartTime=…\tEndTime=…` plus `DATA UPDATE userauthorize Pin=…\tAuthorizeTimezoneId=…\tAuthorizeDoorId=<bitmask>\tDevID=…`. Dates are YYYYMMDD only when `DateFmtFunOn=0`, an encoded number otherwise; 0 = no limit. Read the device options first ([Security PUSH copy][secpush], medium) |
| Expiry | No date field found: delete the user, which also removes the face | EndTime on the device, enforced offline |
| Face from photo | `DATA UPDATE BIOPHOTO PIN=…\tType=9\tSize=…\tContent=<base64>` ([zk-push-server][zkpush], [thai_zkt][thaizkt]). **No real-device report confirms it** | Same |
| Live passages | ATTLOG lines | `rtlog` (time, pin, cardno, event, inoutstatus, verifytype), verified on one ZKTeco U1000 Pro only, not on a SpeedFace ([0xa9u][0xa9u]) |
| Remote opening | `AC_UNLOCK` reported, one excerpt says `AK_UNLOCK` (low) | `CONTROL DEVICE 01<door>01<seconds>00`-style, conflicting readings (low, [dewanlab][dewanlab]) |
| Rotating QR | No | No |

**Panels (case Z3).** The C2-260, inBio Pro and C3 Pro work over PUSH ([Axxon][axxon], [CV SDK guide][cvsdk] lists "inBio Pro Series / C3 Pro Series" under AC PUSH), so the A&C variant of this driver may cover them (medium; the [C2-260 page][c2260] names no protocol).

**New files** (7–10 days + 2 days of lab on a spare terminal):
- `door-agent/src/doors/iclock-server.ts`: listener on the gym VLAN (e.g. `:8088`) for `/iclock/cdata`, `registry`, `push`, `ping`, `getrequest`, `devicecmd`. It can share the §2.0 router.
- `door-agent/src/doors/zk-push-protocol.ts`: command builders, ATTLOG/rtlog parsers, verify 15 → `FACE`.
- `door-agent/src/doors/zkteco-push.ts`: config `{sn, deviceType: 'TA'|'AC', door: 1}`; a per-serial queue with one command in flight; retries keyed on `ID=…&Return=…`; "online" = time since the last poll.
- `managed-users.ts` extended with a photo hash, so BIOPHOTO is sent only when the photo changes.
- `door-agent/test/helpers/fake-iclock-device.ts`.

**Risks**
- **One server per device** ([ZKTeco FAQ][zkfaq]): pointing the terminal at the agent disconnects EDS's or ZKBio's software.
- ADMS can be a paid or locked option; support then has to set `ServerType=0` ([ZKTeco FAQ][zkfaq]).
- HTTPS is on by default in the V5L Cloud Server Setting: turn it off (the device restarts) or put a TLS proxy in front of the agent ([V5L manual][v5l]).
- The channel accepts `Shell <command>`, run on the device ([s0x90][s0x90]). Whoever controls the configured server controls the terminal. Allowlist serial numbers and source IPs, never queue Shell or file commands, and never expose `/iclock`.
- PINs must be digits unless the device reports `StringPinFunOn=1` ([estatemate PR][estatemate]).

---

### 2.3 ZKBio CVSecurity third-party API

Official REST API v1.3 ([manual][cvapi]):
- `POST /api/person/add`: base64 photo, `accStartTime`/`accEndTime`.
- `/api/person/delete`, `/api/door/remoteOpenById?doorId=&interval=`.
- `GET /api/transaction/monitor`, polled no faster than every 10 s.
- `POST /api/person/getQrCode/{pin}`: ZKTeco's own dynamic QR.

**Can:** members with dates, faces from photos, remote opening, passages within about 10 s.
**Cannot:** the rotating MLR1 pass; instant events.
**Cost:** a paid API licence, a CVSecurity server on site, and terminals kept in A&C PUSH. Only sensible if EDS already runs CVSecurity at Meliora. ZKBio Time / BioTime has an employee API but no door-open endpoint ([BioTime 9.5 API][biotime], medium).
**New work:** `door-agent/src/doors/cvsecurity.ts`, or calls from access-service. 3–4 days.

---

### 2.4 Hikvision MinMoe, ISAPI over the LAN

The terminal exposes REST-style ISAPI over HTTP/HTTPS with Digest auth; no Hikvision server or SDK is needed ([official MinMoe page, Chinese][minmoe]). The full English guide is behind the partner-portal login.

**Can**
- **Members with expiry enforced offline.** `POST /ISAPI/AccessControl/UserInfo/Record` and `PUT …/UserInfo/Modify` with `Valid {enable, beginTime, endTime, timeType:'local'}`, `doorRight:'1'`, `RightPlan [{doorNo:1, planTemplateNo:'1'}]` ([Dave93][dave93], [leiyun-studio][leiyun]). For inactive members, set endTime in the past or use `PUT UserInfoDetail/Delete`. Badges: `CardInfo/Record|Modify|Delete`.
- **Face from photo.** Multipart `POST /ISAPI/Intelligent/FDLib/FaceDataRecord`: the JSON part `{faceLibType:'blackFD', FDID:'1', FPID:<employeeNo>}` **first**, then the JPEG. If the member already has a face, this returns `deviceUserAlreadyExistFace`: replace with `PUT FDLib/FDModify` (part `FaceDataModify`), tested on a DS-K1T343MX ([Dave93][dave93]). `FDSetUp` is listed on the official page but untested here.
- **Remote opening.** `PUT /ISAPI/AccessControl/RemoteControl/door/1` with `<cmd>open</cmd>`, verified on a DS-K1T341BM ([zhutiecheng][zhutiecheng]). There is no duration field: the unlock time is a terminal setting (1–255 s per the [DS-K1T606 manual][hik606door], unconfirmed), so the agent's `seconds` is ignored (medium).
- **Live passages.** The terminal pushes to the agent via `PUT /ISAPI/Event/notification/httpHosts` ([ISAPI guide][isapi]); `<url>` must be a path only, because with a full URL the terminal posts nothing ([Dave93][dave93]). Reconcile with `POST /ISAPI/AccessControl/AcsEvent`, where `major` is required ([zhutiecheng][zhutiecheng]). Map the **minor code** ([HCNetSDK.h][hcnet]): 75 face, 1 card, 38 fingerprint, 156 QR passed; 76 face failed, 9 unknown card, 8 card expired. Don't use `currentVerifyMode`: it reports the configured mode, not the one used ([zhutiecheng][zhutiecheng]).

**Cannot (or not proven)**
- **Rotating QR.** Natively the terminal compares a QR with stored card numbers of at most 32 bytes ([HCNetSDK.h][hcnet]). The only native path is remote verification: `AcsCfg.QRCodeEnabled` + `remoteCheckDoorEnabled` with `checkChannelType` ISAPI/ISAPIListen, answered by `PUT /ISAPI/AccessControl/remoteCheck {serialNo, checkResult}` ([MinMoe page][minmoe]). **The ISAPI field carrying the QR text was not found**; only the C SDK's `pQRCodeInfo` is confirmed. Needs a lab test.

**New files** (7–10 days + 1–2 days lab; QR remote check +2 days if the lab test passes):
- `door-agent/src/doors/hik-isapi.ts`: Digest client on the shared helper. Accepts self-signed HTTPS; reads `ResponseStatus` (statusCode 1 = OK, an empty 200 is OK too).
- `door-agent/src/doors/hik-events.ts`: route `POST /hik/:doorId` for JSON, XML or multipart. Drops `currentEvent=false` backlog, heartbeats and **snapshot parts** (§4.2). Dedupes by serialNo + time; sweep cursor in `DATA_DIR/hikvision-events-<doorId>.json`.
- `door-agent/src/doors/hikvision.ts`: config `{ip, https, username, password, doorNo, syncUsers, syncFaces, eventMode, qrMode}`, plus `DATA_DIR/hikvision-users-<doorId>.json`.
- `door-agent/test/helpers/fake-isapi-terminal.ts`.
- MIT code from [Dave93][dave93] (digest, face multipart, event parser) can be vendored.

**Risks**
- Only one `alertStream` session per terminal, and a dead client blocks new ones: prefer push plus sweep ([zhutiecheng][zhutiecheng]).
- `GET /ISAPI/AccessControl/DeployInfo` lists who already listens (iVMS, HikCentral) ([MinMoe page][minmoe], medium). That HikCentral re-applies its own people over the agent's writes is unconfirmed.
- serialNo restarting from 1 when storage is full is unconfirmed (forum only), so dedupe by serialNo **and** time.
- Account lockout after about 5 failed logins for about 30 min is unconfirmed ([hikvision-best-practices][hikbp]): use a dedicated ISAPI user.
- "OK" from the API while nothing unlocks was reported once (unconfirmed, [ipcamtalk][ipcam-hik], unreachable). It only opens the lane if the terminal relay is wired to the turnstile's open input.
- Keep the clock on NTP in the Tunis time zone so `Valid.endTime` matches the platform.
- Alternatives: the HikCentral OpenAPI ([v2.5.1][hikcentral]) only if EDS runs HikCentral; ISUP or the C SDK as a last resort.

**Probe on site:** `curl -sk --digest -u user:pass https://<ip>/ISAPI/System/deviceInfo`, then save `/ISAPI/AccessControl/AcsCfg?format=json`, `/ISAPI/Event/notification/httpHosts/capabilities` and `/ISAPI/AccessControl/DeployInfo`.

---

### 2.5 Dahua ASI (and OEM), HTTP CGI

Sources: Dahua's [HTTP API V3.26][dahua326] (a copy hosted by a third party) and the older official [integration instruction][dahuaint]. The instruction documents the **older** calls (`recordUpdater.cgi?action=insert&name=AccessControlCard` with `ValidDateStart/End`, `FaceInfoManager.cgi?action=add`); the `AccessUser`/`AccessFace` `insertMulti` family exists only in API 3.26. Probe which one the firmware answers.

**Can**
- **Members with expiry on the device.** `POST /cgi-bin/AccessUser.cgi?action=insertMulti`, at most 10 per request, with `ValidFrom`/`ValidTo` ('yyyy-MM-dd HH:mm:ss') and `UserStatus` 0 normal / 1 frozen. Per API 3.26 §12.4.1, insertMulti "insert[s] or update[s]… when the current user exists" ([API 3.26][dahua326]). Falling back to `updateMulti` on errors is a defensive choice for some firmware ([SCARVEL][scarvel]), not an API requirement. **Known risk:** on one Intelbras SS 3530 MF FACE W, users written this way did not appear in the device's own list and were listed `IsValid=false`, with no fix ([Intelbras forum][intelbras-forum]). Verify on the device itself.
- Badges: `AccessCard.cgi?action=insertMulti`. Events may show card numbers in hex (unconfirmed): compare with our badges.
- **Face from photo.** `AccessFace.cgi?action=insertMulti {FaceList:[{UserID, PhotoData:[base64]}]}` ([API 3.26][dahua326]). `removeMulti` sent as GET answered OK without deleting: send it as POST+JSON and re-list ([erwix note][erwix]).
- **Remote opening.** `GET /cgi-bin/accessControl.cgi?action=openDoor&channel=1&Type=Remote`. The unlock time is `AccessControl[n].UnlockHoldInterval` (250–20000 ms): set it once to 1000 ([API 3.26][dahua326]).
- **Live passages.** `eventManager.cgi?action=attach&codes=[AccessControl]&heartbeat=5` gives `UserID`, `CardNo`, `Method` (1 card, 15 face, 14 QR local, 43 QR remote) and `Status` ([API 3.26][dahua326]). Backfill after reconnects with `recordFinder.cgi?action=find&name=AccessControlCardRec` ([integration instruction][dahuaint]). With one Intelbras SS 3540 (ASI6213J-MW), events appeared in the rroller integration only after switching to `codes=All` ([rroller #296][rroller296]): test `[AccessControl]` first and fall back to `All`.

**Cannot (or not proven)**
- **Rotating QR.** Native QR checks Dahua/DSS codes. The Web 5.0 "Back-end Comparison > QR Code Pass-through" option ([Web 5.0 manual][dahuaweb5]) and the claim that QR needs DSS ([ipcamtalk][ipcam-dahua]) could not be re-verified (unconfirmed). Only Method 43 "QR code, remote" is confirmed ([API 3.26][dahua326]). Lab test needed.
- **Intelbras "Online mode"** (OEM firmware only): the device posts each attempt and waits for `{id, auth, message}`. On timeout it decides offline from its own registered users ([Intelbras manual][intelbras-manual]); it does not let everyone in. Still lab-test the server-unreachable case.

**New files** (6–9 days + 1–2 days lab):
- `door-agent/src/doors/dahua-cgi.ts`: Digest client and `multipart/x-mixed-replace` parser, with a socket-read timeout instead of a total timeout ([rroller client][rroller]).
- `door-agent/src/doors/dahua.ts`: config `{ip, port, https, username, password, channel, syncUsers, realtime, eventMode}`; reconnect after 3 missed heartbeats; dedupe by RecNo (a full page within one second is ambiguous, [Condpulse PR][condpulse]); `DATA_DIR/dahua-users-<doorId>.json`.
- A push route `POST /devices/dahua/:doorId` if push mode is used; a fake CGI device for tests.

**Risks**
- Some firmware lacks `accessControl.cgi` (seen on Dahua intercoms, [rroller client][rroller]; unconfirmed on ASI): fall back to RPC2.
- SmartPSS or DSS can be a second system managing members.
- Default IP 192.168.1.108, SDK port 37777 open ([Web 3.0 manual][dahuaweb3]): change the admin password, create a dedicated CGI user, and turn off P2P and SSH.

**Other brands, briefly**
- **Anviz FacePass 7:** binary TCP; templates only, no photos; remote opening supported; no per-user expiry found ([MxLabs/Anviz][anviz]).
- **Suprema:** gRPC G-SDK with startTime/endTime ([G-SDK][gsdk]). Its "QR bypass", which forwards the raw QR text, is in the C/C# SDK only ([QR bypass][qrbypass]).
- **Uniview and generic Android terminals:** not researched. Treat as case R until their API is documented.

---

### 2.6 Relay only (Shelly or ESP32 on the turnstile board)

The terminal keeps its own relay on the open input, and the platform's relay is wired **in parallel** (parallel dry contacts act as an OR; this is my inference from the boards' dry-contact inputs).

**Boards**
- **ZKTeco TS-type / Lenvica:** K1–GND opens left, K2–GND opens right. Dry contact only, **never voltage**; pulse ≤1 s. J9 gives 12 V (max 3 A). The arms drop on power loss, and DOW–GND drops them for a fire ([TS2100][ts2100], [Lenvica][lenvica]).
- **PERCo-type:** Unlock A/B to GND. The board keeps its state on power loss, so evacuation needs the NC Fire Alarm loop. PASS A/B relay outputs report passages ([PERCo TTR-04.1][perco]).
- **Hikvision DS-K3G200BX:** built-in access controller managed over ISAPI, with lock outputs, 2 exit-button inputs, RS-485, Wiegand and a fire input; no plain "open" input is documented ([datasheet][hikk3g]). Open it through the exit-button input or ISAPI, confirmed on site.
- **Dahua ASGG5xxT:** built-in controller ([product page][asgg], unconfirmed). Same approach as Hikvision.

**Can:** remote opening today, with no new code. Use a dry-contact **Shelly Plus 1 / 1 Gen3** (12 VDC supply, potential-free O/I, [Shelly Plus 1][shellyplus1]) on K1/GND, driven by an `HTTP_RELAY` door with the URL `http://<ip>/rpc/Switch.Set?id=0&on=true&toggle_after=0.5`. Set the Shelly to power-on default OFF ([Shelly gate guide][shellygate]) and the input to "detached". Whether `toggle_after=0.5` works over RPC is untested; the API type is "number" ([Switch API][shellyswitch]).

**Optional passage feedback.** A Shelly Plus Uni has 2 potential-free outputs and a COUNT input, reporting by webhook ([Plus Uni][shellyuni], [Webhook API][shellyhook]). Measure the board's counter output first: the manuals don't say its electrical type (medium). Its output polarity against the pulled-up K inputs is untested.

**Cannot:** sync members, faces or expiry; recognise anyone.

**Agent work**
- 0 days with Shelly auth off on an isolated network.
- 1 day to switch `http-relay.ts` to the Digest helper: Shelly Gen2+ documents only Digest SHA-256, so with auth on it will most likely answer 401 (medium, untested).
- 2–3 days for passage events (a webhook route or `door-agent/src/doors/shelly-input.ts`, plus a contract event).

**Risks**
- The Shelly Plus 1 is Wi-Fi only, and inside a stainless-steel housing Wi-Fi may be unreliable (my assessment). Mount it outside the housing, or use a wired ESP32 with Ethernet driving a relay.
- Double passages if board memory mode is on.
- The platform must never be the only way to free the lane: check the fire input and power-cut behaviour on site.

---

### 2.7 QR reader at the turnstile (the rotating pass)

**Why the terminals can't check it.** `MLR1.<memberCode>.<step>.<sig>` is about 56 characters and changes every 30 s ([access-code.ts](../../backend/libs/common/src/utils/access-code.ts)).
- ZKTeco [QR] terminals accept a static QR equal to a stored card number, or ZKTeco's dynamic QR, which needs a ZKBio CVAccess server ([V4L Pro manual][v4lpro]).
- Hikvision and Dahua compare against stored credentials unless remote verification works (§2.4, §2.5).
- **Wiegand cannot carry it.** W26 carries 24 data bits ([Wiegand][wiegand]), W34 32 bits ([ESPHome decoder][esphome-src]); reader W66 options exist ([QR600 guide][qr600]). The S4A / QU-ER-80 family only passes QR text made of hex digits over Wiegand, sends it as decimal, over WG26/WG34 only ([S4A manual][s4a], [QU-ER-80 manual][quio]): a long badge number can come out cut down, so the §1 digits test can mislead.

**Never** switch to a static QR equal to a badge number: anyone with a screenshot gets in.

| Reader output | Example | Agent today | Work |
|---|---|---|---|
| USB HID keyboard | GM65, switched from its default TTL-232 serial mode with the "USB PC Keyboard" setup code; keyboard layout can be set to France for an AZERTY host ([GM65 manual][gm65]) | Works through stdin, but all scans go to `DEFAULT_DOOR_ID`, and the systemd unit sets `SCAN_STDIN=false` (needs a console with autologin, [README](../../door-agent/README.md)) | 0 days for **one lane per agent host**. Two USB readers on one host can't be told apart |
| Network HTTP/TCP | S4A / QU-ER-80 with RJ45, default IP 192.168.1.99. HTTP mode "needs a domain name address" and offers only fixed PHP/JSP/C#/ASP formats ([S4A manual][s4a]) | `POST /scan` takes `{code, doorId}` + `x-scan-token` | 0.5–1 day: capture one request, add a per-reader route or IP→door map, and a local DNS name |
| USB virtual COM / TTL / RS-232 (ASCII) | GM65, S4A | Not supported | 1–2 days: `door-agent/src/scan/serial-scanner.ts` |
| Vendor RS-485 or Wiegand | ZKTeco QR500 / QR600 (W26/32/34/66, RS-485, OSDP; [QR600 guide][qr600]); QR500 Pro RS-485 protocol under NDA ([QR500 Pro][qr500pro]); Hikvision DS-KER02X ([DS-KER02X][hikker02]) | Not supported | Replace the reader. Or an ESP32 Wiegand bridge to `/scan` ([ESPHome][esphome-wg]) **plus a new numeric code**: W34 = 12-bit member index + 20-bit MAC is about 6-digit OTP strength and needs throttling ([RFC 4226][rfc4226]). 4–6 days across backend, app and bridge. Not recommended |

**Two lanes:** either network readers posting their `doorId`, or one agent host per lane, each with its own `AGENT_KEY` and `DEFAULT_DOOR_ID` (this also avoids long USB runs), or new code reading each USB device by its `/dev/input/by-id` path.

**Feedback at the lane:** a USB keyboard reader has no green/red signal, so a refused member sees nothing. Prefer a network reader or ESP32 that shows the result from the HTTP status, or add a small display.

**Wiring:** move the QR reader's data lines to the agent or bridge. Left on the terminal's Wiegand input, the terminal rejects MLR1 codes as unknown cards. Opening still goes through the relay or CMD_UNLOCK.

---

### 2.8 Effort summary (estimates, one engineer who knows the agent, on-site time excluded)

| Item | Days |
|---|---|
| Shared base (§2.0 items 1, 2, 4, 5, 8): contracts incl. `AccessMethod` migration, result/direction, validity mapping, sync now, Digest, push router with auth, docs | 5–8 |
| Face package: consent + staff photo approval (backend, web, mobile), device-sized photo route, per-member enrolment status, erase-biometrics | 4–6 |
| ZKTeco 4370: verify byte, log backfill, grace-then-delete policy | 2–4 |
| ZKTECO_PUSH driver incl. fake device (+ lab) | 7–10 (+2) |
| CVSecurity API driver (+ licence, server) | 3–4 |
| Hikvision ISAPI driver incl. fake (+ lab; QR remote check +2) | 7–10 (+1–2) |
| Dahua CGI driver incl. fake (+ lab) | 6–9 (+1–2) |
| Shelly: config / Digest / passage input | 0 / 1 / 2–3 |
| QR reader: USB / HTTP adapter / serial / Wiegand + numeric code | 0 / 0.5–1 / 1–2 / 4–6 |

Faces from photos for one brand = base + face package + driver + lab ≈ **18–26 days**.

---

## 3. Recommendation

**Order to try**
1. **Identify, change nothing** (§1). Get models, firmware, credentials and wiring from EDS. Decide **one** system to manage members on the terminals.
2. **Make the lane safe and correct (no code).** Board memory off; terminal lock-relay 1 s and door sensor "None"; `unlockSeconds = 1` on each turnstile door; test the power cut and fire input on each lane; confirm a swing or emergency gate exists for wheelchairs, strollers and evacuation, and how it is controlled (another door in the platform, or staff only).
3. **Fit the fallback on one lane**, then the second.
4. **ZKTeco answering on TCP 4370:** with EDS's agreement, after a backup, and only if the terminal is not tied to their push server, run the §2.1 on-site test on one terminal. If all checks pass, roll out to both lanes; faces stay enrolled at the terminal by staff.
5. **Faces from member photos, or expiry by the device clock:** only after the INPDP step in §4.1. Buy a spare terminal of the same model for the lab, build the §2.0 shared work, then the driver for the confirmed brand. Use the CVSecurity API only if EDS already runs it.
6. **Terminal QR forwarding** (Hikvision remote check, Dahua pass-through): lab-test only if you want to drop the separate reader; keep the reader until the test passes.

**The fallback that works with any terminal on a dry-contact turnstile board.** It covers boards with a documented dry-contact "open" input (ZKTeco TS-type, Lenvica, PERCo). Hikvision or Dahua turnstiles with their own controller use the exit-button input or their API instead (§2.6).
- **Per lane and direction:** a dry-contact relay (Shelly Plus 1 / 1 Gen3, or a wired ESP32) in parallel with the terminal relay on the open input, driven by the existing `HTTP_RELAY` driver. Pulse 0.5–1 s, power-on default OFF, isolated network.
- **Per lane:** a raw-text QR reader, either network (posting `{code, doorId}` to `/scan`) or USB with one agent host per lane.
- **At reception:** a key switch or push button wired in parallel on the open input, which works without internet, server or agent.
- **The terminal keeps working on its own** for faces and badges.

It gives the rotating QR, remote opening from the app and the admin, and terminals that still recognise faces and badges offline. It does **not** keep the terminal's member list in step with Meliora: until a driver from step 4 or 5 runs, expired members enrolled on the terminal still get through unless EDS's software or staff removes them. Agree a weekly routine with EDS.

---

## 4. Legal and operations

### 4.1 Personal and biometric data in Tunisia

*I'm not a lawyer. The text below is from the law itself ([loi organique 2004-63, French text][loi]) unless marked otherwise. Confirm with the INPDP or a lawyer before enabling faces.*

**What the 2004 law says**
- **Declaration:** every processing of personal data needs a prior declaration to the INPDP (art. 7); no objection within one month counts as acceptance. This already covers the member database and photos, faces or not. **Check whether Meliora has filed one.** The forms and procedure are in [decree 2007-3004][decret].
- **Consent:** processing needs the person's "consentement exprès et écrit", which can be withdrawn at any time (art. 27). People must be informed in writing beforehand (art. 31).
- **Purpose:** data cannot be used for another purpose than the one it was collected for, unless the person consents (art. 12). The member photo was collected for display to staff ([API.md](../API.md) "Member photos"), so enrolling faces from it needs its own consent.
- **Children:** processing data about a child needs the guardian's consent **and** the family judge's authorisation (art. 28).
- **Destruction:** data must be destroyed at the end of the retention period stated in the declaration or authorisation, or once the purpose is achieved, with a report by a bailiff in the presence of an INPDP-appointed expert (art. 45). Ask the INPDP how this applies to routine deletion of templates.
- **Security and processors:** the controller and any processor must secure the data and keep it confidential (art. 18, 19, 23). That covers EDS's access to terminals and to EXPERTDEV-SPORT.
- **Transfer abroad:** always needs INPDP authorisation (art. 52). It applies if prod, backups or photos are hosted outside Tunisia; check where prod is hosted.
- **Video surveillance:** needs prior INPDP authorisation (art. 69), only at places such as entrances open to the public (art. 70), only if necessary (art. 71), with clear permanent signage (art. 72), and destroyed when no longer needed (art. 74). Whether passage snapshots taken by a face terminal count as video surveillance is not stated in anything found.
- **Penalties:** 1 year and 5,000 TND for processing without the art. 7 declaration or the art. 15/69 authorisations, or transferring abroad without authorisation (art. 90). 2 years and 10,000 TND for processing without consent (art. 27 §1) or breaking art. 14 §1, 28 §1, 70 or 71 (art. 87).

**Biometrics: what is and isn't established**
- The 2004 law **does not mention biometric data.** Its "sensitive" list (art. 14: racial or genetic origin, religious beliefs, political, philosophical or trade-union opinions, health), which needs INPDP authorisation (art. 15), does not name faces.
- A consultancy guide lists biometric data among sensitive data needing written consent and "souvent" prior INPDP approval, without citing an article ([DPO Consulting][dpoc]).
- The INPDP's own 2019 compilation counts 230 files under a "Biométrie" category between 2015 and 2019 ([Recueil, statistics p. 117][recueil]). So the INPDP handles biometric files as their own type; the table doesn't say whether they were declarations or authorisations.
- The 2018 draft law in that compilation would have forbidden biometric processing except with INPDP authorisation, and forbidden making a service conditional on consent ([Recueil][recueil]). It was never adopted.
- A new bill (132 articles) has been in parliamentary committee since July 2025 ([report][bill2025], [Feb 2026][bill2026]); no adoption found. Re-check which text is in force before going live.

**So, before faces go live:**
1. Confirm or file the art. 7 declaration for the existing platform.
2. Ask the INPDP in writing whether face enrolment for access control needs an authorisation. Include the purpose, the non-biometric alternative, the retention period and the security measures.
3. Do not put real member photos or face data on the sandbox, which runs on a server shared with another company's system.

### 4.2 Consent, enrolment and deletion

- **Consent:** a separate, written, opt-in for the face, distinct from the profile photo, in Arabic and French. Record who consented, when and to which text. Badge or rotating QR stays available for anyone who refuses. The platform has no consent field today.
- **Minors:** no face enrolment for members under 18 unless art. 28 is satisfied; use badge or QR.
- **Who takes the photo:** today the app accepts any gallery picture with a crop chosen by the member ([change-photo.tsx](../../mobile/src/app/change-photo.tsx)), so a member could upload a friend's face. Push a face to a terminal only after staff approve the photo, or capture it live at the desk (neutral background, no cap or glasses).
- **Results per member:** devices reject poor faces, but `UserSyncResult` only has totals. Show enrolled / rejected (reason) / pending in the admin, with a "retake photo" flow.
- **Deletion:** erase the terminal user and templates at once when the member is deleted, withdraws consent, or deletes the photo (`DELETE /api/me/photo`). After expiry, disable for a short grace period, then delete after the retention period set in the INPDP filing.
- **Migration:** export the users, PINs and badges already on the terminals or in EXPERTDEV-SPORT and match them to members (the agent's take-over by name or badge only covers part of this). Plan the enrolment campaign; on 4370, staff enrol each face at the terminal under the PIN shown in the member file. When Meliora takes over, have EDS export and then delete the member data it holds.
- **Anti-spoofing:** record the settings on each device: liveness ("Anti-Spoofing using NIR") and the 1:N threshold (default 75, range 65–120, [V5L manual][v5l]). Expect occasional false accepts with twins and look-alikes.
- **Passage snapshots:** turn off picture saving and upload on the devices (Hikvision `uploadVerificationPic`/`saveVerificationPic`, [vvpich][vvpich]; the ZKTeco camera function is off by default, [V5L manual][v5l]). The agent drops picture parts and never logs or forwards them.
- **Capacity:** compare the model's face and user capacity with the member count, including disabled former members (examples: DS-K1T673 10,000 faces, [datasheet][hikbqr]).
- **Badges:** EM 125 kHz or MIFARE; one number format (decimal or hex, W26 or full UID) on every device; a desk USB reader of the same technology to register new badges.

### 4.3 Offline behaviour

| Situation | Face / badge at the terminal | Rotating QR | App / admin "Ouvrir" | Expiry and renewals | Passage log |
|---|---|---|---|---|---|
| Internet or server down | Works | Refused ([README](../../door-agent/README.md)) | Impossible: use the key switch | 4370: list frozen, so expired members keep access and renewals are refused until the next sync. A&C PUSH / Hikvision / Dahua: end dates still enforced by the device clock; renewals wait | Agent buffers punches on disk |
| Agent host down | Works | Not processed | Impossible | As above | 4370: punches lost today (no backfill). Hikvision/Dahua: recovered by the planned log sweep |
| Terminal down | None on that lane | Works if reader and relay don't depend on the terminal | Relay works | – | – |
| Power cut | Depends on UPS. ZK-type boards drop the arms (lane open); PERCo-type keep state | Needs UPS for reader, agent and switch | Needs UPS | – | – |

- Put a UPS on the agent host, switch, terminals and readers, and measure how long each runs.
- Write a reception procedure for outages: physical override plus a paper log.
- Verifying the QR's HMAC locally in the agent would keep QR working offline, but it would put member secrets on the gym's machine: a deliberate design decision, not planned.

### 4.4 Firmware

- Record each device's model and firmware (in the admin, or a sheet until then).
- No automatic updates; updates only through EDS, after a backup (ZKTeco USB Manager > Download user data, [V4L Pro manual][v4lpro]; Hikvision/Dahua user export).
- Re-run the on-site test after any update: an update can turn Standalone Communication off again, change ADMS or ISAPI behaviour, or reset settings.
- **Known ZKTeco CVEs:**
  - CVE-2023-3938: SQL injection through a crafted QR code shown to the device, which can grant entry as an enrolled user.
  - CVE-2023-3939 / 3943: command execution with full device control.
  - CVE-2023-3940: file reading, including biometric data.

  They affect ProFace X, Smartec ST-FR041ME/ST-FR043 and ZAM170-NF firmware up to 1.8.25 "and possibly others". No fixed version is listed ([CVE record][cve3938], [Kaspersky][kaspersky]). Turn the terminal's own QR reading off on ZAM170 units unless EDS shows a patched firmware. The equivalent Hikvision and Dahua advisory checks were not done.
- **Spare lab terminal:** test PUSH, ISAPI or CGI drivers and device-type changes on a spare unit of the same model, never on a production lane.

### 4.5 Network and security

- **Separate device network.** ISP boxes usually can't do VLANs (my assessment), so plan a managed switch and a router.
  - Give terminals, relays, QR readers and the agent host static IPs or DHCP reservations.
  - The agent host reaches the device network and, outbound only, the internet. Push ports are open only to device IPs.
  - Run an NTP server on that network (router or agent host): every path depends on device clocks.
  - Plan an Ethernet run to each post.
- **Default passwords:** change them on every device. Use Meliora-owned admin accounts and dedicated API users (ISAPI, CGI).
- **Comm Key:** the agent can only use Comm Key 0 (§2.1), so isolation is the protection on the 4370 path.
- **SSH:** on by default on SpeedFace-V4L Pro and V5L ([V4L Pro][v4lpro], [V5L][v5l] manuals). Turn it off, and on Dahua too, together with P2P.
- **Never expose** `/iclock`, the device push routes, ISAPI, CGI or 4370 to the internet. Remote maintenance goes through WireGuard or Tailscale, with no inbound port at the gym.
- **Stored secrets:** device passwords sit in clear in the door `config` (a `jsonb` column, masked only in the admin API) and are sent to the agent ([door.entity.ts](../../backend/apps/access-service/src/doors/door.entity.ts), [API.md](../API.md) "Door config secrets"). Restrict database access, and rotate the passwords when staff or EDS's role changes.
- **Theft:** templates live on the terminal. ZKTeco says device data is AES-256 encrypted ([V5L manual][v5l]), but CVE-2023-3940 read files including biometric data. Mount terminals securely and use the tamper alarm.
- **Installer:** EDS's old WordPress site served at least one injected spam post in 2023 ([archive][eds-spam]). Don't leave credentials only the installer knows on gym equipment.
- **Radio equipment:** Wi-Fi devices (Shelly, ESP32) imported into Tunisia need type approval ([5mglobal][cert], secondary source). Buy from a local distributor.

### 4.6 Day-to-day operations

- **Monitoring:** the admin shows online/offline, but nobody is told. Add an n8n alert to the owner when an agent or terminal is offline for more than N minutes or a sync fails, and name who responds (EDS or the developer).
- **Agent updates:** roll out and roll back agent versions on site over the VPN; keep `DATA_DIR` across updates ([README](../../door-agent/README.md)).
- **Each on-site test:** back up the terminal first, note EDS's server address and settings so they can be restored, and agree go/no-go criteria before starting.
- **Shopping list** (prices not researched; get local quotes):
  - per lane: dry-contact relay(s) and a raw-text QR reader that reads phone screens and suits the mounting;
  - agent host (Raspberry Pi or mini-PC), one per lane if USB readers;
  - UPS;
  - managed switch and router;
  - cabling to the posts and an electrician;
  - key switch or push button at reception;
  - a spare terminal for lab work if a driver is built.

[eds-shop]: https://expert-dev-solutions.com/WS_EDS_WEBSITE/api/marketplace/produit
[eds-ts]: https://web.archive.org/web/20230927020730/https://expert-dev-solutions.com/tourniquets/
[eds-pt]: https://web.archive.org/web/20231001011806/https://expert-dev-solutions.com/pointeuses/
[eds-sport20]: https://web.archive.org/web/20201127051003/http://www.expert-dev-solutions.com/expertdev-sport/
[eds-spam]: https://web.archive.org/web/20240221114357/https://expert-dev-solutions.com/2023/02/28/the-ideal-wedding-guidebook/
[v5l]: https://catalogoarquitectura.s3.amazonaws.com/media/post_file/Manual-Usuario-Speedface-V5L_TD__91514166-f167-4838-a544-6d948fc6d224.pdf
[v4lpro]: https://zkteco-online.com/files/instruction/speedface-v4l-pro.pdf
[v5lds]: https://zkteco.me/download-file/3486
[zkfaq]: https://www.zkteco.com/en/faq
[cvlist]: https://www.zkteco-ea.com/wp-content/uploads/2024/01/03-ZKBio-CVSecurity_Hardware-Suggestion-list_20240103.pdf
[cvsdk]: https://smartid.com.vn/media/lib/17-03-2022/zkteco_cv_products_sdk_selection_guide-e190830b.pdf
[sdk21]: https://raw.githubusercontent.com/aiikendoit/zktecostandalonepullsdk/HEAD/Doc-Ver2.1/ZKTeco_Standalone_SDK_Development_Manual_V2.1_A.2-EN.pdf
[pyzk]: https://github.com/fananimi/pyzk
[pyzk170]: https://github.com/fananimi/pyzk/issues/170
[pyzk221]: https://github.com/fananimi/pyzk/issues/221
[zktecojs]: https://github.com/coding-libs/zkteco-js
[s0x90]: https://raw.githubusercontent.com/s0x90/zkteco-adms/HEAD/datasheet/ADMS.md
[zkpush]: https://raw.githubusercontent.com/LuisTorr35/zk-push-server/HEAD/docs/protocol/README.md
[thaizkt]: https://github.com/ecosoft-frappe/thai_zkt
[secpush]: https://pdfcoffee.com/securitypushcommunicationprotocol-pdf-free.html
[0xa9u]: https://github.com/0xa9u/zkteco-security-push-adms-python
[dewanlab]: https://github.com/dewanlab/laravel-zkteco-adms-core
[estatemate]: https://github.com/barikblog/estatemate-minmoe/pull/45
[axxon]: https://docs.axxonsoft.com/confluence/x/mC_-Eg
[c2260]: https://zkteco.com/en/C2Series/C2-260
[pyzkaccess]: https://github.com/bdragon300/pyzkaccess
[c3py]: https://github.com/vwout/zkaccess-c3-py
[cvapi]: https://d1agmp9y4cki1i.cloudfront.net/files/20251125/ZKBio%20CVSecurity%20_3rd%20Party%20API_User%20Manual_2025.pdf
[biotime]: https://zkteco.sa/download-file/3198
[cve3938]: https://db.gcve.eu/vuln/CVE-2023-3938
[kaspersky]: https://www.kaspersky.com/about/press-releases/kaspersky-finds-24-vulnerabilities-in-chinese-biometric-access-systems
[minmoe]: https://open.hikvision.com/hardware/v2/08%E5%8D%8F%E8%AE%AE%E9%80%8F%E4%BC%A0/%E6%98%8E%E7%9C%B8%E9%97%A8%E7%A6%81.html
[isapi]: https://github.com/kamjin3086/hik_isapi_docs/blob/main/Intelligent%20Security%20API%20(General%20Application)%20Developer%20Guide.pdf
[dave93]: https://github.com/Dave93/hikvision-isapi-ts
[leiyun]: https://github.com/leiyun-studio/hikvision-isapi
[zhutiecheng]: https://github.com/zhutiecheng/hikvision_acs
[hcnet]: https://github.com/Ye-HO/HCNetSDK_For_Delphi/blob/main/HCNetSDK.h
[hik606]: https://enpinfo.hikvision.com/unzip/20201102205526_84041_doc/GUID-80ABCE8D-68A1-4E6A-8547-32364ABFD437.html
[hik606door]: https://enpinfo.hikvision.com/unzip/20201102205526_84041_doc/GUID-EAB6003C-34F3-4C95-8AFE-638F57886AFE.html
[hik670photo]: https://enpinfo.hikvision.com/hkwsen/unzip/20251224164304_81809_doc/GUID-1C74D204-C508-44DA-B19A-411FF9D7C050.html
[hik670isup]: https://enpinfo.hikvision.com/hkwsen/unzip/20251224164304_81809_doc/GUID-9044D844-2E2D-4358-B65E-FCEFF19F00AE.html
[hikbqr]: https://assets.hikvision.com/prd/normal/all/doc/m000170345/DS-K1T673DWX-BQR_Datasheet_20240617.pdf
[hikk3g]: https://assets.hikvision.com/prd/normal/all/doc/m000154943/DS-K3G200BX_Datasheet_20251016.pdf
[hikker02]: https://www.hikvision.com/en/products/speed-gate-and-turnstiles/peripheral-products/reader-components/ds-ker02x
[hikbp]: https://github.com/uchkunr/hikvision-best-practices
[hikcentral]: https://enpinfo.hikvision.com/hkwsen/unzip/20240201150721_74009_doc/pdf.pdf
[vvpich]: https://github.com/vvpich/hikvision-acs
[ipcam-hik]: https://ipcamtalk.com/goto/post?id=993448
[dahua326]: https://cdn.shopify.com/s/files/1/0747/5383/5293/files/HTTP_API_3.26.pdf
[dahuaint]: https://files.dahua.support/Solutions/Access%20Control%20Solution/Integration/DAHUA%20ACCESS%20CONTROL%20PRODUCTS%20INTEGRATION%20INSTRUCTION%20Ver1.0.pdf
[dahua-asi]: https://www.dahuasecurity.com/products/All-Products/Access-Control--Time-Attendance/AI/Standalone/Pro/ASI7214S-W
[dahuaweb3]: https://material.dahuasecurity.com/uploads/cpq/DOR/PUM0006993/Face_Recognition_Access_Controller_Web_3.0_User_s_Manual_V1.0.2.pdf
[dahuaweb5]: https://dahuawiki.com/images/Files/Manuals/Face_Recognition_Access_Controller_Web_5.0_User_s_Manual_V1.2.1%20(1).pdf
[rroller296]: https://github.com/rroller/dahua/issues/296
[rroller]: https://raw.githubusercontent.com/rroller/dahua/main/custom_components/dahua/client.py
[scarvel]: https://raw.githubusercontent.com/felipeitaenga/SCARVEL/b4c901f85f971e6c012baa7cdd989702d16bc6c8/backend/drivers/intelbras.py
[intelbras-forum]: https://forum.intelbras.com.br/viewtopic.php?t=73026
[intelbras-manual]: https://manuais.intelbras.com.br/manual-interface-web-linha-bio-t/pt-BR/manual_SS3530_MFFACEW_pt-BR.html
[erwix]: https://github.com/jonathanlara08/erwix-app-releases/releases/tag/bridge-v1.2.7
[condpulse]: https://github.com/advancedgit-alt/Condpulse-v2.0/pull/132
[ipcam-dahua]: https://ipcamtalk.com/threads/access-control.78573
[asgg]: https://www.dahuasecurity.com/vi/products/All-Products/Access-ControlTime-Attendance/Turnstiles/ASGG5XXT
[anviz]: https://github.com/MxLabs/Anviz
[gsdk]: https://supremainc.github.io/g-sdk/api/user/
[gsdk-connect]: https://supremainc.github.io/g-sdk/api/connect/
[qrbypass]: https://support.supremainc.com/en/support/solutions/articles/24000089202--biostar-2-device-sdk-how-to-use-qr-bypass-
[ts2100]: https://descargas.fiesa.com.ar/descargas/ZKTeco/Manuales/TS1000-1200-2000-2100-2200/TS2100%20Tripod%20Turnstile%20User%20Manual%20V1.0_20140328.pdf
[lenvica]: https://lenvica.com/device-brochures/www.lenvica.com-UserManual-TS2000Series.pdf
[perco]: https://www.perco.com/download/techspec/eng/TTR-04-1_TechSpec_EN.pdf
[shellyplus1]: https://kb.shelly.cloud/knowledge-base/shelly-plus-1
[shellygate]: https://allterco.freshdesk.com/en/support/solutions/articles/103000362926-controlling-a-garage-door-or-gate-with-shelly-1-gen3-gen4
[shellyswitch]: https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Switch
[shellyauth]: https://shelly-api-docs.shelly.cloud/gen2/General/Authentication
[shellyuni]: https://kb.shelly.cloud/knowledge-base/shelly-plus-uni
[shellyhook]: https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Webhook
[gm65]: https://cdn.hackaday.io/files/1681637194685792/brm65_man.pdf
[qr600]: https://download.securityrussia.com/zkteco-qr600_qsg.pdf
[qr500pro]: https://zkteco.eu/sites/default/files/content/downloads/qr500_pro_leaflet_20221217.pdf
[s4a]: https://es.s4a-access.com/uploadfile/attachment/S4A%20User%20Manual%20QR%20code%20Access%20Reader%20(EM%20or%20Mi%20fare%20type).pdf
[quio]: https://asset.conrad.com/media10/add/160267/c1/-/en/002568441ML00/navodila-za-uporabo-2568441-quio-qu-er-80-4-citalnik-kartic.pdf
[wiegand]: https://en.wikipedia.org/wiki/Wiegand_interface
[esphome-wg]: https://esphome.io/components/wiegand/
[esphome-src]: https://github.com/esphome/esphome/blob/dev/esphome/components/wiegand/wiegand.cpp
[rfc4226]: https://www.rfc-editor.org/rfc/rfc4226
[loi]: https://legislation-securite.tn/wp-content/uploads/sites/5/2023/11/Loi-n%C2%B0-2004-63-du-27-Juillet-2004-Fr.pdf
[decret]: https://legislation-securite.tn/wp-content/uploads/sites/5/2023/11/Decret-n%C2%B0-2007-3004-du-27-Novembre-2007-Fr.pdf
[recueil]: https://www.mjs.tn/images/pdf/archive/1.pdf
[dpoc]: https://www.dpo-consulting.com/fr-fr/blog/loi-tunisienne-sur-la-protection-des-donnees
[bill2025]: https://fr.allafrica.com/stories/202507210438.html
[bill2026]: https://businessnews.com.tn/2026/02/27/donnees-personnelles-le-parlement-se-penche-sur-la-modernisation-de-la-legislation-tunisienne/1390118/
[cert]: https://5mglobal.com/type-approval-tunisia/
