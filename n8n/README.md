# Meliora Gym — n8n automations

Customer e-mails, owner reports and Instagram content ideas for Meliora Gym, built on n8n and the
Meliora backend (webhook events + automation API, see [`docs/API.md`](../docs/API.md)). All e-mails
are in French, in the Meliora look (black, white and red, logo, buttons, footer with the address,
Instagram @gymmeliora and Facebook).

| # | Workflow | When | Data | Sends to |
|---|---|---|---|---|
| 01 | E-mails clients (événements) | each backend event (webhook) | event `data` | member / prospect / reception / owner |
| 02 | Anniversaires des membres | every day 09:00 | `GET /api/automation/birthdays` | members |
| 03 | Motivation des membres inactifs | every day 10:00 + Monday 09:00 summary | `inactive?days=7`, `schedule?days=7` | members, owner |
| 04 | Newsletter du planning | Sunday 18:00 | `schedule?days=7`, `recipients?segment=active` | active members (batches of 20) |
| 05 | Rapport quotidien du gérant | every day 07:30 | `daily-report` | owner |
| 06 | Idées de contenu Instagram (Claude) | Monday 08:00 | `schedule?days=7`, `gym` + Claude API | owner |
| 07 | Point opérations hebdomadaire | Monday 08:30 | `leads-follow-up`, `low-stock`, `maintenance-due?days=7` | owner |
| 08 | Relance des abonnements expirés | Monday 10:30 | `expired?days=7` | members |

Workflow 01 handles: `member.created` (bienvenue), `subscription.created` (confirmation),
`payment.received` (reçu), `subscription.expiring` (rappel), `subscription.expired` (invitation à
renouveler), `booking.created` (réservation), `lead.created` (confirmation de la séance d'essai au
prospect + alerte à l'accueil), `sale.completed` (reçu boutique), `stock.low` and
`maintenance.opened` (alertes au gérant).

## Setup

### 1. Start n8n

```bash
cd n8n
cp .env.example .env        # set N8N_ENCRYPTION_KEY, MELIORA_* (owner e-mail, logo URL, phone…)
docker compose up -d        # http://localhost:5678
```

The workflows read their settings with `$env` (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` is set in
`docker-compose.yml`). `MELIORA_LOGO_URL` must be a public URL (for example the website serving
`assets/images/logo.jpg`), otherwise mail clients show a broken image.

### 2. Create the credentials (Settings → Credentials), with exactly these names

| Name | Type | Value |
|---|---|---|
| `Meliora SMTP` | SMTP | your mail server. Gmail: `smtp.gmail.com`, port 465, SSL on, user = the Gmail address, password = an [app password](https://myaccount.google.com/apppasswords) |
| `Meliora webhook (Authorization)` | Header Auth | Name `Authorization`, Value `Bearer <WEBHOOK_AUTH_TOKEN>` |
| `Meliora webhook signature` | Crypto | HMAC secret = `<WEBHOOK_SECRET>` (same value as in `backend/.env`) |
| `Meliora automation API (x-api-key)` | Header Auth | Name `x-api-key`, Value = `AUTOMATION_API_KEY` from `backend/.env` |
| `Anthropic API (x-api-key)` | Header Auth | Name `x-api-key`, Value = your Anthropic API key (workflow 06, and 03 when `MELIORA_MOTIVATION_AI=true`) |

### 3. Import the workflows

Editor: **⋯ → Import from file** and pick each `workflows/*.json`, or from the command line:

```bash
docker compose exec n8n n8n import:workflow --separate --input=/workflows
```

Open each workflow once and check that every node shows its credential (select it if n8n did not
match it by name), then **activate** it. Schedules use the `Africa/Tunis` timezone.

### 4. Connect the backend

In `backend/.env` (or the root `.env` with Docker), two different random values
(`openssl rand -hex 32`):

```
N8N_WEBHOOK_URL=http://<n8n host>:5678/webhook/meliora-events
WEBHOOK_SECRET=<secret of the "Meliora webhook signature" credential>
WEBHOOK_AUTH_TOKEN=<token of the "Meliora webhook (Authorization)" credential, without "Bearer ">
AUTOMATION_API_KEY=<same key as the "Meliora automation API" credential>
```

Every event is `POST`ed as `{ id, event, occurredAt, data }` with the headers:

```
Authorization: Bearer <WEBHOOK_AUTH_TOKEN>
X-Meliora-Timestamp: <unix seconds of this attempt>
X-Meliora-Signature: sha256=<hex HMAC-SHA256(WEBHOOK_SECRET, "<X-Meliora-Timestamp>.<raw body>")>
X-Meliora-Event: <event>   X-Meliora-Delivery: <event id>
```

Workflow 01 rejects requests without the bearer token (Header Auth), stops on a bad signature or on a
timestamp more than 5 minutes away from n8n's clock (execution in error), and ignores an event `id`
it has already processed (backend retries never send an e-mail twice; each retry is signed again with
a new timestamp).

The signing key itself is never sent: n8n saves the request headers with each execution, so they only
reveal the bearer token, which cannot sign events. With `NODE_ENV=production` the backend never sends
an unsigned event (without `WEBHOOK_SECRET` or `WEBHOOK_AUTH_TOKEN` the delivery fails at once).
Outside production an empty `WEBHOOK_AUTH_TOKEN` falls back to `WEBHOOK_SECRET`, with a warning.

**Upgrading from the body-only signature** (one step in n8n, within 30 minutes of the backend
deploy that adds `WEBHOOK_AUTH_TOKEN`): deactivate workflow 01, set the value of
`Meliora webhook (Authorization)` to `Bearer <WEBHOOK_AUTH_TOKEN>`, re-import workflow 01 and
activate it. Meanwhile n8n answers 404 (inactive workflow) or 403 (bearer token of the other
version), and the backend retries those events (6 attempts over about 30 minutes) instead of losing
them on a failed check after n8n has already answered 200.

## How the workflows work

- **01** — Webhook (Header Auth, raw body) → *Code* builds `"<timestamp>.<raw body>"` and checks the
  timestamp → HMAC check (Crypto + If, then If on the timestamp) → *Remove Duplicates* on the event id
  → Switch on `event` → one *Code* node per event renders its template → *Send Email*. Events without
  an e-mail address (e.g. a booking made at the desk for a member without e-mail) are skipped.
- **02 / 05 / 08** — Schedule → automation API → *Code* (template) → *Send Email*.
- **04** — builds one HTML schedule for the week (stops when there is no class), then sends it to
  every active member by batches of 20 with a 2 s pause.
- **06** — summarises the week's classes and the club info, asks Claude for a weekly theme, 3 posts
  (hook, caption, call to action, visual idea, best day), 5 story ideas and hashtags, and e-mails the
  draft to the owner for approval. If the API call fails or is declined, the owner still gets the
  e-mail with the raw schedule and the reason.
- **07** — one e-mail with the prospects to call back, the products in low stock and the equipment
  due for maintenance in the next 7 days ("Rien à signaler ✅" when a list is empty).

### 03 · Motivation of inactive members

Every day at 10:00 the workflow fetches the members without a visit for 7+ days and the next classes,
and sends one e-mail per member according to the length of the absence:

| Stage | Absence | E-mail |
|---|---|---|
| Petit rappel | 7 – 13 days | friendly nudge to book the next session |
| Motivation | 14 – 29 days | encouragement, the next 3 classes, a coach tip |
| Reprise | 30 days + | comeback offer (`MELIORA_COMEBACK_OFFER`, default: a free session with a coach), reply / call / WhatsApp |
| Premiers pas | never came since joining | how to start: tour of the club, discovery session, first class |

- Each stage is sent **at most once per absence**: sent stages are stored in the workflow static data
  under `memberId:stage:lastVisitAt`. When the member comes back and later stops again, the stages start
  over. Keys older than 180 days are pruned. A stage whose e-mail failed is retried the next day.
- Static data is only saved for **active (production) executions**, not for manual test runs.
- With `MELIORA_MOTIVATION_AI=true`, Claude writes one personal motivational sentence per e-mail
  (only the first name and the length of the absence are sent). When the key is missing, the call
  fails or the answer is unusable, the e-mail uses the stage's built-in sentence.
- Every Monday at 09:00 the owner receives how many members got each stage during the last 7 days,
  with the names of the members absent for more than a month (worth a phone call).

## Claude API (workflows 03 and 06)

The *HTTP Request* nodes call `POST https://api.anthropic.com/v1/messages` with the headers
`anthropic-version: 2026-10-21` and `anthropic-beta: server-side-fallback-2026-07-01`:

- model `claude-opus-5-5` (override with `MELIORA_CLAUDE_MODEL`); thinking is adaptive by default, and
  depth is set with `output_config.effort` (`medium` for the weekly content, `low` for the one-line
  motivation sentence);
- the answer is constrained to JSON with `output_config.format` (`json_schema`), so it is parsed
  without fragile text matching;
- `fallbacks: "default"` enables server-side refusal fallback: if a safety classifier declines the
  request, the API retries it on the recommended fallback model in the same call. Responses are
  checked for `stop_reason` (`refusal`, `max_tokens`) before the content is used.

Cost stays small: one request a week for workflow 06, and one short request per motivation e-mail
when the option is on.

## Editing the e-mails

Templates live in `templates/` (`layout.html` + one fragment per e-mail) and the Code-node logic in
`scripts/n8n-code.mjs`. The workflow JSON files are generated — edit the sources, then:

```bash
npm run build      # regenerates workflows/*.json
npm run validate   # structure checks + runs every Code node with sample data, renders preview/*.html
```

Re-import the changed workflow in n8n (import over the existing one or delete it first).

Template syntax: `{{value}}` (escaped), `{{{html}}}` (raw), `{{#if key}}…{{/if}}` (not nested), and
build-time shortcuts `[[kicker:…]]`, `[[h1:…]]`, `[[h2:…]]`, `[[button:Label|{{url}}]]`,
`[[details]] [[row:Label|Value]] [[/details]]`, `[[note]]…[[/note]]`.

`npm run validate` also accepts `N8N_NODES_BASE_DIR=/path/to/n8n-nodes-base` to check node types and
versions against an installed n8n-nodes-base package (the workflows target n8n 2.45).

## Troubleshooting

| Symptom | Check |
|---|---|
| Backend gets 401/403 from the webhook | `Meliora webhook (Authorization)` value is `Bearer <WEBHOOK_AUTH_TOKEN>` |
| Executions fail on "Signature invalide" | the Crypto credential secret equals `WEBHOOK_SECRET` in `backend/.env`, and workflow 01 is the current version (the signature covers `X-Meliora-Timestamp`) |
| Executions fail on "Horodatage …" | the clocks of the backend and n8n servers (NTP): events more than 5 minutes old are refused as replays |
| Deliveries fail with "Envoi refusé en production" | `WEBHOOK_SECRET` and `WEBHOOK_AUTH_TOKEN` are both set for notification-service |
| HTTP nodes fail with 401 | `x-api-key` value equals `AUTOMATION_API_KEY` |
| `$env` errors / empty links | `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, variables present in `.env`, container restarted |
| Owner reports not received | `MELIORA_OWNER_EMAIL` is set (owner e-mails are skipped when it is empty) |
| Motivation e-mails sent again after tests | static data is not kept for manual runs: test with the workflow active |
