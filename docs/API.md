# Meliora Gym — API contract

Single public entry point: the **API gateway** (`backend/apps/api-gateway`), default `http://localhost:4000`.
Interactive docs (Swagger): `http://localhost:4000/docs`.

The TypeScript types referenced below live in `backend/libs/common/src/contracts/*.ts` — they are the
source of truth for every payload. Web and mobile clients should mirror them in their own `types.ts`.

## Conventions

- Base path: `/api`. JSON in, JSON out. Dates are ISO strings; date-only fields are `YYYY-MM-DD`.
- Money is a `number` in TND (3 decimals), e.g. `120.5` → "120,500 DT".
- Auth: `Authorization: Bearer <accessToken>`. Access tokens live 15 min; call `POST /api/auth/refresh`
  with the refresh token (30 days) when a request returns **401**.
- Errors: `{ "statusCode": 404, "message": "Membre introuvable." }` — `message` may be a string or an
  array of validation messages (French, ready to display).
- Roles: `ADMIN`, `STAFF` (reception), `COACH`, `MEMBER`. "staff" below = ADMIN or STAFF.

## Public (no auth)

| Method | Path | Result |
|---|---|---|
| GET | `/api/public/gym` | `GymInfo` — name, tagline, address, city, phone, email, instagram, mapsUrl, location `{lat,lng}`, geofenceMeters, openingHours `[{days,open,close}]` |
| GET | `/api/public/plans` | `PlanDto[]` (active plans, sorted) |
| GET | `/api/public/classes?from&to` | `ClassSessionDto[]` (default: next 7 days) |
| GET | `/api/public/coaches` | `PublicCoach[]` |
| GET | `/api/health` | `{ status, services: { auth: 'up'|'down', membership, class, access, notification } }` |

## Auth

| Method | Path | Body | Result |
|---|---|---|---|
| POST | `/api/auth/register` | `{ firstName, lastName, email, password (≥8), phone?, birthDate?, gender? }` | `AuthResult` (creates a MEMBER) |
| POST | `/api/auth/login` | `{ email, password }` | `AuthResult` = `{ accessToken, refreshToken, expiresIn, user: UserDto }` |
| POST | `/api/auth/refresh` | `{ refreshToken }` | `AuthResult` |
| POST | `/api/auth/logout` | – (auth) | `{ ok: true }` — revokes all refresh tokens of the user |
| GET | `/api/auth/me` | – (auth) | `UserDto` |
| PATCH | `/api/auth/password` | `{ currentPassword, newPassword }` | `{ ok: true }` |

## Member self-service (role MEMBER)

| Method | Path | Body | Result |
|---|---|---|---|
| GET | `/api/me` | – | `MeResponse` = `{ user: UserDto, profile: MemberProfile, access: MemberAccessInfo }` |
| PATCH | `/api/me` | `{ firstName?, lastName?, phone?, birthDate?, emergencyContact? }` | `MemberDto` |
| GET | `/api/me/access-key` | – | `AccessKey` = `{ memberCode, secret, period: 30, format }` (see QR code below) |
| GET | `/api/me/doors` | – | `MemberDoor[]` |
| POST | `/api/me/doors/:doorId/open` | `{ latitude, longitude, accuracy? }` | `AccessDecision` = `{ granted, reason?, door?, member?, at }` |
| GET | `/api/me/visits?limit=30` | – | `AccessLogDto[]` |
| GET | `/api/me/classes?from&to` | – | `ClassSessionDto[]` with `bookingId` set when booked |
| GET | `/api/me/bookings?includePast=false` | – | `BookingDto[]` (with `session`) |
| POST | `/api/me/bookings` | `{ sessionId }` | `BookingDto` (requires an active membership) |
| DELETE | `/api/me/bookings/:id` | – | `BookingDto` (status CANCELLED) |
| PUT | `/api/me/push-token` | `{ token }` (Expo push token) | `{ ok: true }` |

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
| PATCH | `/api/subscriptions/:id` | `{ status?: ACTIVE|FROZEN|CANCELLED, endDate? }` | `SubscriptionDto` |
| GET | `/api/payments` | `?from&to&method&memberId&page&pageSize` | `PaymentsPage` (`items, total, page, pageSize, sum`) |

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
| POST | `/api/classes` | staff, COACH | `CreateClassRequest` | `ClassSessionDto[]` (one per repeated week) |
| PATCH | `/api/classes/:id` | staff, COACH | `UpdateClassRequest['data']` | `ClassSessionDto` |
| DELETE | `/api/classes/:id` | staff | – | `{ ok: true }` |
| GET | `/api/classes/:id/bookings` | staff, COACH | – | `BookingDto[]` |
| PATCH | `/api/bookings/:id` | staff, COACH | `{ status: BOOKED|CANCELLED|ATTENDED }` | `BookingDto` |

### Users (staff accounts & coaches) — ADMIN
`GET /api/users?role&search` → `UserDto[]` · `POST /api/users` (`CreateUserRequest`, role ADMIN|STAFF|COACH) → `UserDto` ·
`PATCH /api/users/:id` → `UserDto` · `DELETE /api/users/:id` → `{ ok: true }`

### Access control (staff)
| Method | Path | Body / query | Result |
|---|---|---|---|
| GET | `/api/access/logs` | `?limit=50&doorId&memberId&result&before` | `AccessLogDto[]` (newest first) |
| POST | `/api/access/scan` | `{ code, doorId }` — QR scanned at reception / kiosk | `AccessDecision` (opens the door when granted) |
| GET | `/api/doors` | – | `DoorDto[]` (with `online`) |
| POST | `/api/doors` | `CreateDoorRequest` (ADMIN) | `DoorDto` |
| PATCH | `/api/doors/:id` | `Partial<CreateDoorRequest>` (ADMIN) | `DoorDto` |
| DELETE | `/api/doors/:id` | – (ADMIN) | `{ ok: true }` |
| POST | `/api/doors/:id/open` | `{ reason? }` | `AccessDecision` (manual opening, logged with the staff name) |
| GET | `/api/agents` | – (ADMIN) | `AgentDto[]` |
| POST | `/api/agents` | `{ name }` (ADMIN) | `CreateAgentResult` = `{ agent, apiKey }` — key shown once |
| DELETE | `/api/agents/:id` | – (ADMIN) | `{ ok: true }` |

### Dashboard (staff)
| Method | Path | Result |
|---|---|---|
| GET | `/api/dashboard/summary` | `{ members: { total, active, newThisMonth, expiringSoon }, revenue: { today, thisMonth, lastMonth }, checkIns: { today, uniqueToday, deniedToday }, classes: { today, upcomingBookings, fillRate30d } }` |
| GET | `/api/dashboard/revenue?months=12` | `RevenuePoint[]` (`{ month: 'YYYY-MM', total, count }`, oldest first, months without payments included with 0) |
| GET | `/api/dashboard/checkins?days=30` | `CheckinStats` = `{ daily: [{ date, count, unique }], hourly: [{ hour 0-23, count }] }` |
| GET | `/api/dashboard/expiring?days=7` | `ExpiringItem[]` |
| GET | `/api/dashboard/plan-mix` | `PlanMixItem[]` |

## Realtime (Socket.IO)

**Staff live feed** — `io('http://localhost:4000/live', { auth: { token: accessToken } })` (ADMIN/STAFF).
Server emits `access` with an `AccessLogDto` for every door event (granted or denied).

**Door agents** — `io('http://<gateway>:4000/agents', { path: '/agent-socket', auth: { key: '<agent api key>' } })`
(the gateway proxies `/agent-socket` to access-service). Events:

| Direction | Event | Payload | Ack |
|---|---|---|---|
| server → agent | `doors` | `AgentDoorConfig[]` = `[{ id, name, driver, config, unlockSeconds, isActive }]` — on connect and on every change | – |
| server → agent | `door.open` | `{ requestId, doorId, seconds }` | `{ ok: boolean, error?: string }` (8 s timeout) |
| agent → server | `qr.scanned` | `{ doorId, code }` — QR read by a scanner wired to the agent | `AccessDecision` (server sends `door.open` itself when granted) |
| agent → server | `device.events` | `{ doorId, events: [{ deviceUserId: string, method: 'CARD'|'FINGERPRINT', at: ISO }] }` — punches recorded by the ZKTeco terminal | `{ accepted: number }` |
| agent → server | `members.sync` | `{}` | `[{ deviceUid: number, name: string, cardNumber: string|null, active: boolean }]` — users to enrol/disable on the terminal |
| agent → server | `heartbeat` | `{ version, doors: [{ id, status: 'ok'|'error', error? }] }` | – |

## Rotating QR access code

The app shows `MLR1.<memberCode>.<step>.<sig>` refreshed every 30 s:

```
step = floor(unixSeconds / 30)
sig  = hex(HMAC_SHA256(key = secret (utf8), message = memberCode + "." + step)).slice(0, 32)
```

`memberCode` and `secret` come from `GET /api/me/access-key` (cache them; the code works offline).
The server accepts `step` within ±1 period and rejects reuse of an already used step (anti-replay).

## n8n integration

**Outgoing webhooks** — notification-service POSTs every customer-facing event to `N8N_WEBHOOK_URL`:

```
POST <N8N_WEBHOOK_URL>
Authorization: Bearer <WEBHOOK_SECRET>            (n8n Webhook node → "Header Auth" credential)
X-Meliora-Event: payment.received
X-Meliora-Delivery: <uuid>                        (same as body.id, for de-duplication)
X-Meliora-Signature: sha256=<hex HMAC-SHA256(raw body, WEBHOOK_SECRET)>
{ "id": "<uuid>", "event": "payment.received", "occurredAt": "<ISO>", "data": { ... } }
```

Events and `data` (types in `libs/common/src/bus/events.ts`): `member.created` (MemberCreatedEvent),
`subscription.created` (SubscriptionCreatedEvent), `payment.received` (PaymentReceivedEvent),
`subscription.expiring` (SubscriptionExpiringEvent — sent once, `EXPIRY_REMINDER_DAYS` before the end),
`subscription.expired` (SubscriptionExpiredEvent), `booking.created` (BookingEvent).
Failed deliveries are retried with backoff (up to 6 attempts).

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
| POST | `/api/public/trial` | `PublicTrialRequest` = `{ firstName, lastName, phone, email?, trialDate?, interestPlanId?, message? }` — "Séance d'essai gratuite" form (rate limited) | `{ ok: true }` |
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
| Shift planning | `GET /api/shifts?from&to&employeeId` → `ShiftDto[]` · `POST /api/shifts` (`repeatWeeks`) → `ShiftDto[]` · `PATCH/DELETE /api/shifts/:id` |
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
| GET | `/api/workflow-runs/:id` | staff, COACH | – | `WorkflowRunDto` with `tasks` |
| POST | `/api/workflow-runs/:id/cancel` | staff | – | `WorkflowRunDto` |
| GET | `/api/tasks` | staff, COACH | `?status=OPEN|TODO|…&runId&assigneeRole&assigneeEmployeeId&overdueOnly&mine=true` | `TaskDto[]` (`mine`: assigned to my role, to me, or unassigned) |
| POST | `/api/tasks` | staff, COACH | `CreateTaskRequest` (ad-hoc task, may `dependsOn` other task ids) | `TaskDto` |
| PATCH | `/api/tasks/:id` | staff, COACH | `UpdateTaskRequest['data']` (status changes unblock dependents) | `TaskDto` |
| POST | `/api/tasks/:id/retry` | staff | – | `TaskDto` (re-run a FAILED automation) |
| DELETE | `/api/tasks/:id` | ADMIN | – | `{ ok: true }` |
| GET | `/api/workflows/meta` | staff | – | `{ events: string[], roles: Role[] }` (editor dropdowns) |

`GET /api/dashboard/operations` also returns `workflows: WorkflowStats`.
