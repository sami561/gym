# Meliora Gym — API contract

Single public entry point: the **API gateway** (`backend/apps/api-gateway`), default `http://localhost:4000`.
Interactive docs (Swagger): `http://localhost:4000/docs`. With Docker, clients use the web container instead
(`http://<host>:8080`, behind TLS in production): its nginx forwards `/api`, `/docs`, `/socket.io` and
`/agent-socket` to the gateway, whose port 4000 only listens on the server itself (`GATEWAY_BIND`).

The TypeScript types referenced below live in `backend/libs/common/src/contracts/*.ts` — they are the
source of truth for every payload. Web and mobile clients should mirror them in their own `types.ts`.

## Conventions

- Base path: `/api`. JSON in, JSON out. Dates are ISO strings; date-only fields are `YYYY-MM-DD`.
- Money is a `number` in TND (3 decimals), e.g. `120.5` → "120,500 DT".
- Auth: `Authorization: Bearer <accessToken>`. Access tokens live 15 min; call `POST /api/auth/refresh`
  with the refresh token (30 days) when a request returns **401**.
- Refresh tokens are **single-use** (rotation): every refresh answers a new `refreshToken`; store it and
  forget the one you sent. The token just replaced is still accepted for 30 s
  (`REFRESH_REUSE_LEEWAY_SECONDS`: two tabs, a retried request) and the answer then carries the current
  token. Sending an older token, or the replaced one after those 30 s, counts as reuse: that whole sign-in
  is revoked, its newest token included, and the call answers 401 `Session expirée, reconnectez-vous.`.
  Each refresh extends the sign-in to 30 days from now (`JWT_REFRESH_TTL_DAYS`). Refresh tokens issued
  before rotation existed get that 401 once (sign in again).
- Rate limits: authentication runs first, so a protected route called without a valid token answers 401,
  never 429. Signed-in callers are counted per account and per route (300/min unless the route says
  otherwise); `@Public` routes and the automation API per client IP. Behind nginx the IP comes from
  `X-Forwarded-For`, believed only when the request comes from a trusted proxy (`TRUST_PROXY`). Over the
  limit: 429 `{ "statusCode": 429, "message": "ThrottlerException: Too Many Requests" }`.
- Errors: `{ "statusCode": 404, "message": "Membre introuvable." }` — `message` may be a string or an
  array of validation messages (French, ready to display).
- Validation: body fields must have their JSON type — `"30"` for a number, `"false"` for a boolean or an
  object for a text field answers 400 (only the coordinates of `POST /api/me/doors/:doorId/open` also
  accept numbers written as text); unknown fields are dropped. Query parameters are text: numeric ones
  (`?days=30`, `?limit`, `?page`, `?pageSize`…) are read as numbers, boolean ones are true for `true`,
  `1` or `yes` and false otherwise.
- Roles: `ADMIN`, `STAFF` (reception), `COACH`, `MEMBER`. "staff" below = ADMIN or STAFF.

## Public (no auth)

| Method | Path | Result |
|---|---|---|
| GET | `/api/public/gym` | `GymInfo` — name, tagline, address, city, phone, email, instagram, mapsUrl, location `{lat,lng}`, geofenceMeters, openingHours `[{days,open,close}]` |
| GET | `/api/public/plans` | `PlanDto[]` (active plans, sorted) |
| GET | `/api/public/classes?from&to` | `ClassSessionDto[]` (default: next 7 days) |
| GET | `/api/public/coaches` | `PublicCoach[]` |
| GET | `/api/public/coaches/:id/photo?v=` | `image/jpeg`, the uploaded photo of an active coach (`PublicCoach.avatarUrl`, see "Coach photos"); 404 `Aucune photo.` |
| GET | `/api/health` | `{ status, services: { auth: 'up'|'down', membership, class, access, notification } }` |

## Auth

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/auth/register` | `{ firstName, lastName, email, password (≥8), phone?, birthDate?, gender? }` | `AuthResult` (creates a MEMBER) — 5/min per IP |
| POST | `/api/auth/login` | `{ email, password }` | `AuthResult` = `{ accessToken, refreshToken, expiresIn, user: UserDto }` — 10/min per IP; 401 `E-mail ou mot de passe incorrect.` (same answer and timing whether the e-mail exists or not), 403 for a deactivated account |
| POST | `/api/auth/refresh` | `{ refreshToken }` | `AuthResult` with a **new** `refreshToken` (the one sent is used up, see Conventions) |
| POST | `/api/auth/logout` | – (auth) | `{ ok: true }` — ends every sign-in of the user (all devices) |
| GET | `/api/auth/me` | – (auth) | `UserDto` |
| PATCH | `/api/auth/password` | `{ currentPassword, newPassword (≥8) }` | `ChangePasswordResult` = `AuthResult & { ok: true }` (below) |

`PATCH /api/auth/password` ends every session of the user (other devices, and this device's old refresh
token) and returns a fresh session: store its `accessToken` / `refreshToken` like a login. Errors: 401
`Mot de passe actuel incorrect.` (a client that refreshes and retries on every 401 gets it twice), 403
`Ce compte est désactivé. Contactez l’accueil.`; 10/min per account.
Access tokens already issued stay valid until they expire (≤ 15 min, `JWT_ACCESS_TTL_SECONDS`) after a
logout, a password change, a deactivation or a demotion.

## Member self-service (role MEMBER)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/me` | – | `MeResponse` = `{ user: UserDto, profile: MemberProfile, access: MemberAccessInfo }` |
| PATCH | `/api/me` | `{ firstName?, lastName?, phone?, birthDate?, emergencyContact? }` | `MemberDto` |
| GET | `/api/me/access-key` | – | `AccessKey` = `{ memberCode, secret, period: 30, format }` (see QR code below) |
| POST | `/api/me/access-key/rotate` | – (5/min) | `AccessKey` (same shape) — new secret: the codes shown until now stop working at once; save the returned key |
| GET | `/api/me/doors` | – | `MemberDoor[]` (active doors with `allowAppOpen`) |
| POST | `/api/me/doors/:doorId/open` | `{ latitude, longitude, accuracy? }` (20/min) | `AccessDecision` = `{ granted, reason?, door?, member?, at }` (see "Opening from the app") |
| GET | `/api/me/visits?limit=30` | – | `AccessLogDto[]` |
| GET | `/api/me/classes?from&to` | – | `ClassSessionDto[]` with `bookingId` set when booked |
| GET | `/api/me/bookings?includePast=false` | – | `BookingDto[]` (with `session`) |
| POST | `/api/me/bookings` | `{ sessionId }` | `BookingDto` (requires an active membership) |
| DELETE | `/api/me/bookings/:id` | – | `BookingDto` (status CANCELLED) |
| PUT | `/api/me/push-token` | `{ token }` (Expo push token) | `{ ok: true }` |
| GET | `/api/me/photo?v=` | – | the member's own photo, `image/jpeg` (see "Member photos"); 404 `Aucune photo.` |
| PUT | `/api/me/photo` | `multipart/form-data`, field `photo` (10/min) | `MemberDto` with the new `photoUpdatedAt` |
| DELETE | `/api/me/photo` | – | `MemberDto` with `photoUpdatedAt: null` (also when there was no photo) |

**Opening from the app** — checks in this order: member, door active, `allowAppOpen`, network, geofence.
A refusal is `granted: false` with a French `reason`, logged like any denial:
- `Cette porte ne peut pas être ouverte depuis l’application.` — door with `allowAppOpen: false`;
- `Connectez-vous au Wi-Fi de la salle pour ouvrir la porte.` — `APP_OPEN_ALLOWED_NETWORKS` is set and the
  caller's address (`req.ip` as the gateway sees it, see `TRUST_PROXY`) is missing or outside it. Empty
  = no network check; a malformed list refuses every app opening;
- then the geofence reasons (invalid position, too far).

Every attempt, granted or denied, is logged with `context` = `{ latitude, longitude, accuracy,
distanceMeters, clientIp }`, shown to ADMIN only (`GET /api/access/logs`). The phone position alone can be
faked: `APP_OPEN_ALLOWED_NETWORKS` is the effective gate.

## Staff back-office

### Members (staff)
| Method | Path | Body / query | Result |
|---|---|---|---|
| GET | `/api/members` | `?search&status=active|expired|suspended|all&page=1&pageSize=20` | `Paginated<MemberListItem>` |
| POST | `/api/members` | `CreateMemberRequest` (without `actor`) | `CreateMemberResult` = `{ member, subscription, temporaryPassword }` |
| GET | `/api/members/:id` | – | `MemberDetail` = `MemberProfile & { access: MemberAccessInfo, visits: AccessLogDto[] }` |
| PATCH | `/api/members/:id` | `UpdateMemberRequest['data']` | `MemberDto` |
| DELETE | `/api/members/:id` | – (ADMIN) | `{ ok: true }` |
| POST | `/api/members/:id/subscriptions` | `{ planId, startDate?, price?, payment?: { method, amount?, reference? } }` | `SubscriptionDto` |
| POST | `/api/members/:id/payments` | `{ amount, method, reference?, subscriptionId?, paidAt? }` | `PaymentDto` |
| PUT | `/api/members/:id/card` | `{ cardNumber: string | null }` (RFID badge) | `MemberAccessInfo` |
| POST | `/api/members/:id/access-key/rotate` | – (lost or shared phone) | `{ ok: true, rotatedAt }` — the member's QR codes stop working at once; the app gets the new key from `GET /api/me/access-key`. 404 `Membre introuvable.` |
| GET | `/api/members/:id/photo?v=` | – | `image/jpeg` (see "Member photos"); 404 `Aucune photo.` or `Membre introuvable.` |
| PUT | `/api/members/:id/photo` | `multipart/form-data`, field `photo` | `MemberDto` with the new `photoUpdatedAt` |
| DELETE | `/api/members/:id/photo` | – | `MemberDto` with `photoUpdatedAt: null` (also when there was no photo) |
| PATCH | `/api/subscriptions/:id` | `{ status?: ACTIVE|FROZEN|CANCELLED, endDate? }` | `SubscriptionDto` |
| GET | `/api/payments` | `?from&to&method&memberId&page&pageSize` | `PaymentsPage` (`items, total, page, pageSize, sum`) |

**Member photos** — one photo per member, shown to staff (member list and file, live access feed,
reception scanner) and to the member (app profile and pass). ADMIN and STAFF manage any member's photo,
a MEMBER only their own (`/api/me/photo`).
- Upload: `multipart/form-data` with one file field `photo`, a **JPEG** of at most **512 KB** (clients
  resize to a 600×600 square, quality ≈ 0.85, orientation applied, before sending). Refusals: 400
  `Ajoutez une photo (champ « photo »).` (no file in `photo`, and any other unreadable upload: another
  field name, several files, a broken multipart body), 400 `La photo doit être une image JPEG.` (checked
  on the bytes, not on the declared type; a JPEG cut short is refused too), 413 `La photo dépasse 512 Ko.`
  Behind nginx a body over 10 MB is stopped by nginx itself (413 without the JSON body).
- The server removes the JPEG metadata segments (APP1–APP15 and comments: EXIF with the GPS position,
  XMP, the camera thumbnail, also the ICC colour profile, so send sRGB) wherever they are, and drops what
  phones append after the end of the image (second images, motion-photo videos), before storing the file;
  APP0 and the image data are kept byte for byte. What is served is that cleaned file.
- `MemberDto.photoUpdatedAt` (ISO instant, `null` without photo) changes at every upload. Clients load
  `…/photo?v=<Date.parse(photoUpdatedAt)>`: with `v` the answer carries `Cache-Control: private,
  max-age=31536000, immutable`, without it `private, no-cache`, always with an `ETag` (taken from the
  bytes: the same photo has the same ETag on every URL); a matching `If-None-Match` answers 304 without
  body. Photos need the bearer token like any other route: web and app fetch them with it (blob / image
  headers), never through a public URL. Where only a `memberId` is known (access logs, scanner), load
  without `v`; 404 = no photo.
- Deleting a member (`DELETE /api/members/:id`) deletes the photo. A photo is personal data: never in
  logs, events, n8n payloads or the automation API.

### Plans
| Method | Path | Roles | Body | Result |
|---|---|---|---|---|
| GET | `/api/plans?includeInactive=true` | staff | – | `PlanDto[]` |
| POST | `/api/plans` | ADMIN | `CreatePlanRequest` | `PlanDto` |
| PATCH | `/api/plans/:id` | ADMIN | `Partial<CreatePlanRequest>` | `PlanDto` |
| DELETE | `/api/plans/:id` | ADMIN | – | `{ ok: true }` (deactivates when already sold) |

### Classes & bookings
| Method | Path | Roles | Body | Result |
|---|---|---|---|---|
| GET | `/api/classes?from&to` | staff, COACH | – | `ClassSessionDto[]` |
| POST | `/api/classes` | staff, COACH | `CreateClassRequest` | `ClassSessionDto[]` (one per repeated week) — 409 when the room or the coach is taken (below), checked on every week before anything is saved |
| PATCH | `/api/classes/:id` | staff, COACH | `UpdateClassRequest['data']` | `ClassSessionDto` — moving a session (rules below) |
| DELETE | `/api/classes/:id` | staff | – | `{ ok: true }` |
| GET | `/api/classes/:id/bookings` | staff, COACH | – | `BookingDto[]` |
| PATCH | `/api/bookings/:id` | staff, COACH | `{ status: BOOKED|CANCELLED|ATTENDED|NO_SHOW }` | `BookingDto` — NO_SHOW only once the class has started (400 `Impossible de marquer absent avant le début du cours.`); WAITLISTED and LATE_CANCELLED come from the booking flow only (400 `Statut invalide (BOOKED, CANCELLED, ATTENDED ou NO_SHOW).`) |

**Moving a session** (`PATCH /api/classes/:id` with `startsAt` / `endsAt`; the back-office planning drags
sessions on 15-minute slots and sends both). Times are compared to the minute: resending the same
minute (the editor form does) is not a move and keeps the stored value.
- 400 `Cette séance a déjà commencé : elle ne peut plus être déplacée.` — the start of a session in
  progress or over never moves; only the end of a running session may move, and not into the past
  (`La fin de la séance ne peut pas être dans le passé.`, `Cette séance est terminée : ses horaires ne
  peuvent plus changer.`).
- 400 `Impossible de déplacer une séance dans le passé.` — the new start must be in the future
  (BOOKED rows of an ended session become NO_SHOW strikes).
- 400 `Des membres sont déjà pointés pour cette séance : elle ne peut plus être déplacée.`
- 409 when an overlapping session (back-to-back is fine) uses the same room (free text compared
  without case, accents or extra spaces) or the same coach: `La salle « Studio » est déjà prise par
  « Yoga » le 05/11/2026 de 18:30 à 19:30.` / `Leila Ayari anime déjà « Yoga » le 05/11/2026 de 18:30
  à 19:30.` Also checked when only `room` or `coachId` changes, and by `POST /api/classes`. The checks
  run one at a time (database lock), so two requests at the same moment cannot both take the slot.
- Bookings (booked, waitlist, spots) stay on the session. No message is sent about the change itself:
  when the start moves, BOOKED members get the usual `booking.reminder` again with the new time, 2 h
  before the new start, or right away when the new start is less than 2 h away. That reminder is an app
  push only (n8n workflow 01 sends no e-mail for it): members without the app must be told by the gym.

### Users (staff accounts & coaches) — ADMIN
`GET /api/users?role&search` → `UserDto[]` · `POST /api/users` (`CreateUserRequest`, role ADMIN|STAFF|COACH) → `UserDto` ·
`PATCH /api/users/:id` → `UserDto` · `DELETE /api/users/:id` → `{ ok: true }`.
A new `password` or `isActive: false` ends every session of that user. Demoting, deactivating or deleting the
last active ADMIN → 409 `Impossible : c’est le dernier administrateur actif.` (checked atomically).

| Method | Path | Body | Result |
|---|---|---|---|
| PUT | `/api/users/:id/photo` | `multipart/form-data`, field `photo` | `UserDto` with `avatarUrl: "/api/public/coaches/<id>/photo?v=<epoch ms>"` — COACH accounts only: 400 `Seuls les coachs ont une photo sur le site.`; 404 `Utilisateur introuvable.` |
| DELETE | `/api/users/:id/photo` | – | `UserDto` with `avatarUrl: null` (also when there was no photo) |
| GET | `/api/public/coaches/:id/photo?v=` | – (public, no token) | `image/jpeg`; 404 `Aucune photo.` |

**Coach photos** — the photo of a coach on the website (Coaches section) and in the back-office Team page.
- Upload (ADMIN): same file rules, refusals and metadata removal as "Member photos" above (one JPEG file in
  `photo`, 512 KB at most, 400 `Ajoutez une photo (champ « photo »).` / `La photo doit être une image JPEG.`,
  413 `La photo dépasse 512 Ko.`), for an account whose role is COACH (deactivated coaches included). The
  answer's `avatarUrl` is the public route of the photo, a path on the API origin, with a new `v` (epoch ms
  of the upload) at every upload: clients show `avatarUrl` as it is when they are served with the API (nginx,
  Vite proxy), prefixed with the API base URL otherwise; a URL typed by hand is shown as it is.
- `GET /api/public/coaches/:id/photo` needs no token (the website shows it): with `v` the answer carries
  `Cache-Control: public, max-age=31536000, immutable`, without it `public, no-cache`, always with an `ETag`
  (taken from the bytes); a matching `If-None-Match` answers 304 without body. 404 `Aucune photo.` (JSON)
  when no photo was uploaded, for an unknown id, and as soon as the user is no longer an active COACH:
  demoted or deactivated coaches disappear from the site (the photo is kept and comes back with the role).
- `DELETE /api/users/:id/photo` deletes the stored photo and sets `avatarUrl` to null, whatever it was.
- `avatarUrl` typed by hand still works (`POST` with a URL, `PATCH` with a URL or null): a `PATCH` that changes
  it replaces the uploaded photo, which is deleted. A `PATCH` sending back the coach's own
  `/api/public/coaches/<id>/photo…` value (any `v`, e.g. a form re-sending what it loaded) is accepted and
  changes nothing: only the photo routes write that value. Any other relative path → 400.
- Stored by auth-service (`user_photos`, deleted with the user). Never in logs, events or n8n payloads.

### Access control (staff)
| Method | Path | Body / query | Result |
|---|---|---|---|
| GET | `/api/access/logs` | `?limit=50&doorId&memberId&result&before` | `AccessLogDto[]` (newest first). For ADMIN each log also has `context` (position and address of app openings, `null` for other methods); STAFF, `/api/me/visits`, the member detail and the live feed never get it |
| POST | `/api/access/scan` | `{ code, doorId }` — QR scanned at reception / kiosk (60/min) | `AccessDecision` (opens the door when granted) |
| GET | `/api/doors` | – | `DoorDto[]` (with `online`, `allowAppOpen`); `config` is `{}` for STAFF and masked for ADMIN (below) |
| POST | `/api/doors` | `CreateDoorRequest` (ADMIN; `allowAppOpen?`, default true) | `DoorDto` (config masked) |
| PATCH | `/api/doors/:id` | `Partial<CreateDoorRequest>` (ADMIN) | `DoorDto` (config masked) |
| DELETE | `/api/doors/:id` | – (ADMIN) | `{ ok: true }` |
| POST | `/api/doors/:id/open` | `{ reason? }` | `AccessDecision` (manual opening, logged with the staff name) |
| GET | `/api/agents` | – (ADMIN) | `AgentDto[]` |
| POST | `/api/agents` | `{ name }` (ADMIN) | `CreateAgentResult` = `{ agent, apiKey }` — key shown once |
| DELETE | `/api/agents/:id` | – (ADMIN) | `{ ok: true }` |

**Door config secrets** — ADMIN gets `config` with every secret replaced by `"********"` (`DOOR_SECRET_MASK`):
all `headers` values, `basicAuth.password` (the username stays visible), any key containing pass, pwd,
secret, token, key, auth, pin or code at any depth (ZKTeco `commKey` included), such query parameters of
the relay `url` (`?password=********`) and a `user:password@` in it. Send the mask back unchanged (also
`%2A` × 8 inside a URL) to keep the stored value at that place; a mask with nothing stored there → 400
`Secret masqué « ******** » sans valeur enregistrée (config.<path>) : saisissez la valeur.` Door agents
still receive the real config.

**HTTP_RELAY config** — checked on create, and on update when `config` or `driver` is sent (an older door
can still be renamed or turned off), with French 400 messages:
- `url`: required, http or https, no `user:password@` (use `basicAuth`), at most 2048 characters once
  `{seconds}` / `{ms}` / `{doorId}` are filled;
- `method`: GET, POST or PUT (default GET); `headers`: at most 20, valid names, one-line text values;
- `basicAuth`: `{ username, password? }`, no `:` in the username; `body`: text or JSON, at most 10 000
  characters; `timeoutMs`: 500–30 000.

A relay called by the server (door without an agent) is checked again before each call: its address must
be public, or private and inside `RELAY_ALLOWED_NETWORKS` (default `10.0.0.0/8,192.168.0.0/16`); loopback,
link-local (cloud metadata `169.254.169.254`), unspecified, multicast and reserved addresses are always
refused. Redirects are not followed (a 3xx is a failure), the answer body is never read and the timeout
is at most 5 s.

**Opening failures** (every opening route) are French summaries, never the controller's text or the
relay's answer: `Le contrôleur n’a pas pu ouvrir la porte.`, `Le relais a répondu <status>.`,
`Relais de porte injoignable.`, `Adresse du relais non autorisée.`, `Configuration du relais invalide.`

### Dashboard (staff)
| Method | Path | Result |
|---|---|---|
| GET | `/api/dashboard/summary` | `{ members: { total, active, newThisMonth, expiringSoon }, revenue: { today, thisMonth, lastMonth }, checkIns: { today, uniqueToday, deniedToday }, classes: { today, upcomingBookings, fillRate30d } }` |
| GET | `/api/dashboard/revenue?months=12` | `RevenuePoint[]` (`{ month: 'YYYY-MM', total, count }`, oldest first, months without payments included with 0) |
| GET | `/api/dashboard/checkins?days=30` | `CheckinStats` = `{ daily: [{ date, count, unique }], hourly: [{ hour 0-23, count }] }` |
| GET | `/api/dashboard/expiring?days=7` | `ExpiringItem[]` |
| GET | `/api/dashboard/plan-mix` | `PlanMixItem[]` |

## Realtime (Socket.IO)

**Staff live feed** — `io('http://localhost:4000/live', { auth: { token: accessToken } })` (with Docker, the
website origin: nginx forwards `/socket.io`). ADMIN/STAFF access tokens only; any other token gets `error`
`{ message: 'Authentification requise.' }`, then a disconnect.
Server emits `access` with an `AccessLogDto` (without `context`) for every door event (granted or denied).
The server closes the socket when the access token expires (client reason `io server disconnect`): refresh
the token, then reconnect with the new one — only after a successful refresh, with a back-off otherwise.
A deactivated account or a revoked session cannot refresh, so it loses the feed when its current access
token expires (≤ 15 min).

**Door agents** — `io('<SERVER_URL>/agents', { path: '/agent-socket', auth: { key: '<agent api key>' } })`, where
`SERVER_URL` is the website (`https://meliora-gym.tn`, or `http://<server>:8080` on the LAN: nginx forwards
`/agent-socket`) or the gateway itself (`http://localhost:4000` in local development, `http://api-gateway:4000`
for the compose `door-agent` service). The gateway proxies `/agent-socket` to access-service. Events:

| Direction | Event | Payload | Ack |
|---|---|---|---|
| server → agent | `doors` | `AgentDoorConfig[]` = `[{ id, name, driver, config, unlockSeconds, isActive }]` — on connect and on every change (real config, secrets included) | – |
| server → agent | `door.open` | `{ requestId, doorId, seconds }` | `{ ok: boolean, error?: string }` (8 s timeout; `error` stays in the access-service log, callers get a French summary) |
| agent → server | `qr.scanned` | `{ doorId, code }` — QR read by a scanner wired to the agent | `AccessDecision` (server sends `door.open` itself when granted) |
| agent → server | `device.events` | `{ doorId, events: [{ deviceUserId: string, method: 'CARD'|'FINGERPRINT', at: ISO }] }` — punches recorded by the ZKTeco terminal | `{ accepted, duplicates, rejected }` (below) |
| agent → server | `members.sync` | `{}` | `[{ deviceUid: number, name: string, cardNumber: string|null, active: boolean }]` — users to enrol/disable on the terminal (below) |
| agent → server | `heartbeat` | `{ version, doors: [{ id, status: 'ok'|'error', error? }] }` | – |

- `device.events` never fails the batch, and the agent only reads `accepted`. **accepted**: punches logged
  now — a terminal user unknown to the server is logged without a member (reason `Ouvert par le terminal :
  Utilisateur N inconnu du système.`), and a punch dated more than 5 min ahead of the server (terminal clock
  fast) is logged at the time it arrives. **duplicates**: already logged (same door, terminal user and
  terminal time). **rejected**: older than 7 days, malformed, a door of another agent, or beyond the first
  500 of the batch (counted in the access-service log).
- `members.sync` answers `[]` unless the agent drives an active ZKTECO door whose `config.syncUsers` is not
  `false`. `cardNumber` is only set for members who may enter today. Members deleted in the back-office
  stay listed as inactive `Membre supprimé` without a badge, so the terminals disable them.

## Rotating QR access code

The app shows `MLR1.<memberCode>.<step>.<sig>` refreshed every 30 s:

```
step = floor(unixSeconds / 30)
sig  = hex(HMAC_SHA256(key = secret (utf8), message = memberCode + "." + step)).slice(0, 32)
```

`memberCode` and `secret` come from `GET /api/me/access-key` (cache them; the code works offline).
The server accepts `step` within ±1 period and rejects reuse of an already used step (anti-replay).
Rotating the key (`POST /api/me/access-key/rotate`, or staff `POST /api/members/:id/access-key/rotate`)
replaces `secret`: codes built with the old one are refused at once, even a scan already in progress, so
the app must fetch `GET /api/me/access-key` again.

## n8n integration

**Outgoing webhooks** — notification-service POSTs every customer-facing event to `N8N_WEBHOOK_URL`:

```
POST <N8N_WEBHOOK_URL>
Authorization: Bearer <WEBHOOK_AUTH_TOKEN>        (n8n Webhook node → "Header Auth" credential; never the signing key)
X-Meliora-Event: payment.received
X-Meliora-Delivery: <uuid>                        (same as body.id, for de-duplication)
X-Meliora-Timestamp: <unix seconds>               (time of this attempt)
X-Meliora-Signature: sha256=<hex HMAC-SHA256(key = WEBHOOK_SECRET, message = "<X-Meliora-Timestamp>.<raw body>")>
{ "id": "<uuid>", "event": "payment.received", "occurredAt": "<ISO>", "data": { ... } }
```

- The receiver checks the signature over the exact raw body and refuses a timestamp more than 300 s away
  from its clock; n8n workflow 01 does both, then ignores an `id` it has already processed, so a replay
  inside the window does nothing. Each retry gets a new timestamp and a new signature.
- `WEBHOOK_AUTH_TOKEN` and `WEBHOOK_SECRET` are two different values: n8n saves the request headers with
  every execution, so they only reveal the bearer token, which cannot sign events.
- With `NODE_ENV=production` nothing is sent without both keys: the delivery fails at once (`FAILED`,
  `lastError` `Envoi refusé en production : WEBHOOK_SECRET non configuré.`, or `WEBHOOK_AUTH_TOKEN`, or
  both). Outside production an empty `WEBHOOK_AUTH_TOKEN` sends `WEBHOOK_SECRET` as the bearer token and an
  empty `WEBHOOK_SECRET` sends unsigned requests (a warning is logged once).

Events and `data` (types in `libs/common/src/bus/events.ts`): `member.created` (MemberCreatedEvent),
`subscription.created` (SubscriptionCreatedEvent), `payment.received` (PaymentReceivedEvent),
`subscription.expiring` (SubscriptionExpiringEvent — sent once, `EXPIRY_REMINDER_DAYS` before the end),
`subscription.expired` (SubscriptionExpiredEvent), `booking.created` (BookingEvent).
Failed deliveries are retried with backoff (up to 6 attempts). Redirects are not followed: a 3xx answer is a
failed attempt (`lastError` `Redirection refusée (HTTP <status>)`), so `N8N_WEBHOOK_URL` must be the final
address (for example `https://…`, not an `http://` URL that redirects to it).

**Automation API** (header `x-api-key: <AUTOMATION_API_KEY>`), for scheduled n8n workflows:

| Method | Path | Result |
|---|---|---|
| GET | `/api/automation/recipients?segment=active|expired|all` | `Recipient[]` = `[{ memberId, firstName, lastName, email, phone }]` |
| GET | `/api/automation/birthdays` | `BirthdayItem[]` (birthday today) |
| GET | `/api/automation/expired?days=7` | `ExpiredItem[]` (expired in the last N days, not renewed) |
| GET | `/api/automation/inactive?days=14` | `InactiveMember[]` (active members with no visit for N days) |
| GET | `/api/automation/expiring?days=7` | `ExpiringItem[]` |
| GET | `/api/automation/schedule?days=7` | `ClassSessionDto[]` |
| GET | `/api/automation/daily-report?date=YYYY-MM-DD` | `{ date, membership: DailyMembershipReport, access: TodayAccessStats, classes: ClassStats }` |
| GET | `/api/automation/gym` | `GymInfo` |

---

# Gym operations modules (v2)

Types: `contracts/staff.contracts.ts`, `facility.contracts.ts`, `commerce.contracts.ts`, `training.contracts.ts`
and the "Freeze, promo codes, CRM leads" part of `membership.contracts.ts`. Same conventions as above.

## Public additions
| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/public/trial` | `PublicTrialRequest` = `{ firstName, lastName, phone, email?, trialDate?, interestPlanId?, message? }` — "Séance d'essai gratuite" form (5/min per IP) | `{ ok: true }` |
| GET | `/api/public/rooms` | – | `RoomDto[]` (active rooms: name, type, capacity, description) |

## Membership extras (staff)
| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/subscriptions/:id/freeze` | `{ days, reason? }` | `SubscriptionDto` (status FROZEN; end date pushed back on unfreeze) |
| POST | `/api/subscriptions/:id/unfreeze` | – | `SubscriptionDto` |
| GET | `/api/promos` | – (ADMIN) | `PromoCodeDto[]` |
| POST | `/api/promos` · PATCH/DELETE `/api/promos/:id` | `CreatePromoRequest` (ADMIN) | `PromoCodeDto` / `{ ok }` |
| POST | `/api/promos/check` | `{ code, planId }` | `PromoQuote` = `{ code, planPrice, discount, price }` |
| — | `POST /api/members/:id/subscriptions` | accepts `promoCode` | |

## CRM — prospects & free trials (staff)
`GET /api/leads?status&source&search&dueOnly` → `LeadDto[]` · `POST /api/leads` (`CreateLeadRequest`) → `LeadDto` ·
`GET /api/leads/:id` → `LeadDto` with `activities` · `PATCH /api/leads/:id` → `LeadDto` · `DELETE /api/leads/:id` ·
`POST /api/leads/:id/activities` `{ type: CALL|MESSAGE|EMAIL|VISIT|NOTE, note? }` → `LeadActivityDto` ·
`POST /api/leads/:id/convert` `{ password?, planId?, payment? }` → `CreateMemberResult` (creates the member, lead → CONVERTED)

## Staff / HR (staff; payroll ADMIN)
| Resource | Endpoints |
|---|---|
| Employees | `GET /api/employees?search&position&status` → `EmployeeDto[]` · `POST /api/employees` · `GET/PATCH/DELETE /api/employees/:id` |
| Shift planning | `GET /api/shifts?from&to&employeeId` → `ShiftDto[]` (shifts starting in the range) · `POST /api/shifts` (`repeatWeeks`) → `ShiftDto[]` · `PATCH /api/shifts/:id` `{ employeeId?, startsAt?, endsAt?, task?, roomName? }` → `ShiftDto` (the team calendar drags shifts to another day, time or employee) · `DELETE /api/shifts/:id`. End after start, 24 h at most (400); 409 `Chevauchement avec un créneau existant (05/11/2026 08:00).` when the employee already has an overlapping shift (every repeated week is checked, nothing saved). Past shifts can be corrected |
| Time clock | `POST /api/attendance/clock-in` `{ employeeId, at? }` → `AttendanceDto` · `POST /api/attendance/clock-out` `{ employeeId, at? }` → `AttendanceDto` · `GET /api/attendance?from&to&employeeId` → `AttendanceDto[]` |
| Leave | `GET /api/leaves?status&employeeId` → `LeaveDto[]` · `POST /api/leaves` · `POST /api/leaves/:id/decision` `{ status: APPROVED|REJECTED }` (ADMIN) · `DELETE /api/leaves/:id` |
| Payroll (ADMIN) | `GET /api/payroll?period&employeeId` → `PayrollDto[]` · `POST /api/payroll/generate` `{ period? }` → `PayrollDto[]` · `PATCH /api/payroll/:id` `{ bonuses?, deductions?, commissions?, notes? }` · `POST /api/payroll/:id/pay` `{ method }` → `PayrollDto` (also records a SALARY expense) |

## Facility — rooms ("salles"), equipment, maintenance, lockers (staff)
| Resource | Endpoints |
|---|---|
| Rooms | `GET /api/rooms` → `RoomDto[]` · `POST /api/rooms` · `PATCH/DELETE /api/rooms/:id` |
| Equipment | `GET /api/equipment?roomId&status&category&search&dueWithinDays` → `EquipmentDto[]` · `POST /api/equipment` · `GET/PATCH/DELETE /api/equipment/:id` |
| Maintenance tickets | `GET /api/maintenance?status&equipmentId&roomId` → `MaintenanceTicketDto[]` · `POST /api/maintenance` · `PATCH /api/maintenance/:id` (resolving with a cost records a MAINTENANCE expense) |
| Lockers | `GET /api/lockers?roomId&status` → `LockerDto[]` · `POST /api/lockers` `{ roomId?, prefix?, from, to }` → `LockerDto[]` · `PATCH /api/lockers/:id` `{ memberId, memberName?, assignedUntil?, status? }` · `DELETE /api/lockers/:id` |

## Shop / POS, stock, expenses, finance
| Resource | Roles | Endpoints |
|---|---|---|
| Products | staff | `GET /api/products?search&category&includeInactive&lowStockOnly` → `ProductDto[]` · `POST /api/products` · `PATCH/DELETE /api/products/:id` |
| Stock | staff | `POST /api/stock/movements` `{ productId, type: IN|OUT|ADJUSTMENT, quantity, unitCost?, reason? }` → `StockMovementDto` · `GET /api/stock/movements?productId&limit` |
| Sales (POS) | staff | `POST /api/sales` `{ items: [{ productId, quantity }], memberId?, discount?, paymentMethod }` → `SaleDto` · `GET /api/sales?from&to&memberId&page&pageSize` → `SalesPage` · `POST /api/sales/:id/refund` (ADMIN) |
| Expenses | ADMIN | `GET /api/expenses?from&to&category` → `ExpenseDto[]` · `POST /api/expenses` · `PATCH/DELETE /api/expenses/:id` |
| Finance | ADMIN | `GET /api/finance/summary?months=12` → `FinanceSummary` (membership revenue + shop sales − expenses = profit, per month) |

## Training — programs, progress, personal training
| Resource | Roles | Endpoints |
|---|---|---|
| Exercise library | staff, COACH | `GET /api/exercises` → `ExerciseDto[]` · `POST /api/exercises` · `PATCH/DELETE /api/exercises/:id` |
| Workout programs | staff, COACH | `GET /api/programs?memberId&coachId&activeOnly` → `WorkoutProgramDto[]` · `POST /api/programs` · `GET/PATCH/DELETE /api/programs/:id` |
| Body measurements | staff, COACH | `GET /api/members/:id/measurements` → `MeasurementDto[]` (oldest first) · `POST /api/members/:id/measurements` · `DELETE /api/measurements/:id` |
| PT sessions | staff, COACH | `GET /api/pt-sessions?from&to&coachId&memberId` → `PtSessionDto[]` · `POST /api/pt-sessions` · `PATCH /api/pt-sessions/:id` |

Member self-service additions (role MEMBER): `GET /api/me/programs` → `WorkoutProgramDto[]` (active) ·
`GET /api/me/measurements` → `MeasurementDto[]` · `POST /api/me/measurements` `{ weightKg?, bodyFatPct?, waistCm?, ... }` → `MeasurementDto` ·
`GET /api/me/pt-sessions` → `PtSessionDto[]`

## Dashboard additions
`GET /api/dashboard/operations` → `OperationsSummary` = `{ staff: StaffStats, facility: FacilityStats, commerce: CommerceStats, training: TrainingStats, leads: LeadStats }` (each `null` if that service is down).

## Automation & webhooks additions
Automation API: `GET /api/automation/low-stock` → `ProductDto[]` · `GET /api/automation/maintenance-due?days=7` → `EquipmentDto[]` ·
`GET /api/automation/leads-follow-up` → `LeadDto[]` (follow-up due).
New webhook events: `lead.created` (LeadCreatedEvent — confirm the free trial to the prospect + alert the staff),
`sale.completed` (SaleCompletedEvent — receipt when an email is known), `stock.low` (StockLowEvent — owner alert),
`maintenance.opened` (MaintenanceEvent — owner alert for HIGH/URGENT tickets).

---

# Workflows & tasks (v3)

Types: `contracts/workflow.contracts.ts`. A workflow is a template of tasks linked by dependencies (a DAG):
a task becomes `TODO` when every task in its `dependsOn` is `DONE` or `SKIPPED`; until then it is `BLOCKED`.
Runs start manually, from a domain event (`TRIGGERABLE_EVENTS`, e.g. `member.created` → onboarding) or on a cron schedule.
`AUTOMATION` tasks are executed by the engine (HTTP call, e.g. an n8n webhook, `{{placeholders}}` filled from the run context).

| Method | Path | Roles | Body / query | Result |
|---|---|---|---|---|
| GET | `/api/workflows` | staff | – | `WorkflowDto[]` |
| POST | `/api/workflows` | ADMIN | `CreateWorkflowRequest` (tasks + dependsOn links, trigger) | `WorkflowDto` (400 when the links form a cycle) |
| GET | `/api/workflows/:id` | staff | – | `WorkflowDto` |
| PATCH | `/api/workflows/:id` | ADMIN | `Partial<CreateWorkflowRequest>` | `WorkflowDto` |
| DELETE | `/api/workflows/:id` | ADMIN | – | `{ ok: true }` |
| POST | `/api/workflows/:id/start` | staff | `{ context?, title? }` | `WorkflowRunDto` (with tasks) |
| GET | `/api/workflow-runs` | staff | `?workflowId&status&limit` | `WorkflowRunDto[]` |
| GET | `/api/workflow-runs/:id` | staff, COACH | – | `WorkflowRunDto` with `tasks` (COACH: only the tasks they can see, `context: null`; 404 when none) |
| POST | `/api/workflow-runs/:id/cancel` | staff | – | `WorkflowRunDto` |
| GET | `/api/tasks` | staff, COACH | `?status=OPEN|TODO|…&runId&assigneeRole&assigneeEmployeeId&overdueOnly&mine=true` | `TaskDto[]` (`mine`: assigned to my role, to me, or unassigned) |
| POST | `/api/tasks` | staff, COACH | `CreateTaskRequest` (ad-hoc task, may `dependsOn` other task ids) | `TaskDto` |
| PATCH | `/api/tasks/:id` | staff, COACH | `UpdateTaskRequest['data']` (status changes unblock dependents) | `TaskDto` (COACH: 404 for a task they cannot see) |
| POST | `/api/tasks/:id/retry` | staff | – | `TaskDto` (re-run a FAILED automation) |
| DELETE | `/api/tasks/:id` | ADMIN | – | `{ ok: true }` |
| GET | `/api/workflows/meta` | staff | – | `{ events: string[], roles: Role[] }` (editor dropdowns) |

`GET /api/dashboard/operations` also returns `workflows: WorkflowStats`.

**Coach scope** — a COACH only reaches the tasks assigned to role COACH and the unassigned ones (no
`assigneeRole`, no `assigneeEmployeeId`); ADMIN and STAFF are not scoped.
- `PATCH /api/tasks/:id` on another task → 404 `Tâche introuvable.`, checked first (a closed run's 409 is not
  revealed either).
- `POST /api/tasks` and `PATCH /api/tasks/:id`: each `dependsOn` id a coach adds must be a task they can see,
  otherwise 400 `Tâche liée introuvable.` (the same answer as for an id that does not exist). Links the task
  already has may be sent back unchanged or removed.
- `GET /api/workflow-runs/:id` → 404 `Exécution introuvable.` unless one of the run's tasks is theirs; the run
  then holds only those tasks and `context: null` (`progress` still counts every task of the run).
- 409 messages name the tasks they cannot see « tâche d'une autre équipe », e.g.
  `Tâche bloquée par : « tâche d'une autre équipe ».`

**Automation URLs** — `POST` / `PATCH /api/workflows` check each `AUTOMATION` task URL: http or https, no
`user:password@`, at most 2048 characters (`{{placeholders}}` are kept as typed). Otherwise 400
`Automatisation « <title> » : URL invalide.` (or `… : URL trop longue (2048 caractères maximum).`,
`… : URL invalide : seuls les protocoles http et https sont acceptés.`,
`… : URL invalide : retirez l'identifiant et le mot de passe de l'URL.`).
Before each call the URL, placeholders filled, is checked again: only the n8n host and port of
`N8N_WEBHOOK_URL`, the hosts in `AUTOMATION_ALLOWED_HOSTS` (`host` or `host:port`) and public addresses
may be called — never loopback, private networks or cloud metadata. Redirects are not followed; the call
times out after 10 s. The task's `output`:
- refused destination → `FAILED` with `Destination interdite : <host>`, `Destination introuvable : <host>`
  or a URL message such as `URL invalide.`;
- 3xx → `FAILED` with `Redirection refusée (HTTP <status>)`;
- otherwise `HTTP <status> — <body>` (at most 1000 characters, `…` when cut) for `text/*` and JSON
  bodies only; any other or missing content type gives just `HTTP <status>`.

---

# Class reservations (v4)

Types: `contracts/class.contracts.ts` (BookingStatus, BookingPolicy, ClassSessionDto, BookingDto).

- **Places & waitlist** — `ClassSessionDto` now carries `spotsLeft`, `waitlistCount`, `waitlistCapacity`,
  `spotSelection`, `takenSpots`, `bookingOpensAt`, `bookingClosesAt`, `cancelDeadline` and, for the member,
  `bookingStatus`, `spotNumber`, `waitlistPosition`.
- `POST /api/me/bookings` `{ sessionId, spotNumber? }` → `BookingDto` with status `BOOKED`, or `WAITLISTED`
  (with `waitlistPosition`) when the class is full. `spotNumber` is required when `spotSelection` is on.
  Errors (French): booking not open yet / closed, spot taken, already booked, inactive membership,
  too many no-shows (blocked until a date), waitlist full.
- `DELETE /api/me/bookings/:id` → cancels; after `cancelDeadline` the booking becomes `LATE_CANCELLED`
  (a strike). Any freed place promotes the first `WAITLISTED` member (event `booking.promoted`).
- Attendance — a GRANTED door access of the member from `CHECKIN_WINDOW_MINUTES` before the start until the
  end marks the booking `ATTENDED` automatically; staff can also `PATCH /api/bookings/:id { status }`
  (BOOKED, CANCELLED, ATTENDED, or NO_SHOW once the class has started).
  Bookings still `BOOKED` 15 minutes after the end become `NO_SHOW` (a strike).
- Strikes — `NO_SHOW_LIMIT` strikes (no-show or late cancel) in 30 days block new bookings for
  `NO_SHOW_BLOCK_DAYS`. `GET /api/me/booking-standing` → `MemberBookingStanding`;
  `GET /api/bookings/policy` (public) → `BookingPolicy`.
- Reminders — `booking.reminder` is published 2 h before the class for every BOOKED member (sweep every
  `BOOKING_SWEEP_SECONDS`, 300 by default). It reaches members as an app push only: it is forwarded to
  n8n, but workflow 01 has no branch for it (no e-mail). `booking.promoted` notifies the member who got
  the place.
- Staff: `POST /api/classes` accepts `spotSelection` and `waitlistCapacity`; `GET /api/classes/:id/bookings`
  returns booked, waitlisted (with position), attended and no-show rows.

---

# Dashboard analytics (v5)

| Method | Path | Roles | Result |
|---|---|---|---|
| GET | `/api/dashboard/members-analytics` | staff | `MembersAnalytics` — total / active / expired / suspended / frozen / never subscribed, gender split, age groups, new members per month (12), churned last 30 days, renewal rate 90 days |
| GET | `/api/dashboard/team?date=YYYY-MM-DD` | staff | `TeamOverview` — employees total / active / by position, who is on duty right now (planned shift and/or clocked in), present count, every shift of the day |

The team calendar (who works when) uses `GET /api/shifts?from&to` (week view, one row per employee or one
column per day, coloured by position) plus `GET /api/attendance?from&to` to compare planned vs. real hours.

## Business KPIs — GMV, NMV, margins (v5)

`GET /api/dashboard/kpis?from=YYYY-MM-DD&to=YYYY-MM-DD` (ADMIN) → `FinanceKpis` (default: current month):
- **GMV** = memberships sold at plan list price + shop sales subtotals (before any discount, refunds included)
- **NMV** = GMV − discounts (promo codes, POS discounts) − refunds (shop) − cancellations (subscriptions)
- **Gross margin** = NMV − cost of goods sold (shop unit cost captured at sale time), `grossMarginPct` = / NMV
- **Operating profit** = NMV − COGS − expenses (rent, salaries, maintenance…), `operatingMarginPct` = / NMV
- **Cash collected** = payments received + completed shop sales; **MRR** = active subscriptions normalised to
  30 days; **ARPU** = membership NMV / active members
- `monthly`: per month `{ gmv, nmv, expenses, profit, marginPct }`; `breakdown` gives the membership and shop parts.
