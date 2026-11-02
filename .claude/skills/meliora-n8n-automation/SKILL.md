---
name: meliora-n8n-automation
description: Customer e-mails and content automations for Meliora Gym in n8n — event webhooks from notification-service, the x-api-key automation API, branded French templates, motivation / win-back / birthday / newsletter / reports / Instagram ideas workflows. Use whenever the user wants an e-mail, reminder, campaign, report, notification or "automatisation" for members, prospects or the owner, or mentions n8n, even if they don't say "n8n".
---

# n8n automations

## Two ways data reaches n8n
1. **Events (push)** — notification-service POSTs every `WEBHOOK_EVENTS` entry
   (`backend/libs/common/src/bus/events.ts`) to `N8N_WEBHOOK_URL` with
   `Authorization: Bearer <WEBHOOK_AUTH_TOKEN>` (never the signing key — n8n stores headers in every
   execution), `X-Meliora-Event`, `X-Meliora-Delivery` (dedupe id), `X-Meliora-Timestamp` (unix s)
   and `X-Meliora-Signature: sha256=<HMAC-SHA256(WEBHOOK_SECRET, "<timestamp>.<raw body>")>`.
   Workflow 01 refuses timestamps more than 300 s away and ignores ids it already processed.
   Outbox + retries (6 attempts, new timestamp and signature each time). Workflow 01 routes by `event`.
2. **Feeds (pull)** — scheduled workflows call `GET /api/automation/*` with `x-api-key:
   AUTOMATION_API_KEY` (recipients, birthdays, inactive, expired, expiring, schedule,
   daily-report, low-stock, maintenance-due, leads-follow-up, gym). Base URL from `$env.MELIORA_API_URL`.

## Adding an automation
- **New trigger from a domain event**: add the event to `EVENTS`, `EventPayloads` and
  `WEBHOOK_EVENTS` (see the add-microservice skill), publish it from the owning service, then add
  a branch in `n8n/workflows/01-*.json` + a template. Nothing else in the backend changes —
  notification-service subscribes to the whole list.
- **New scheduled e-mail**: prefer an existing feed; add a feed to the gateway
  `AutomationController` only when the data isn't available yet.
- Templates: `n8n/templates/*.html`, French, Meliora black/white/red, address + Instagram footer,
  one clear CTA. Keep e-mails short and human; members can't reply to automations unless a
  reply-to is set.
- De-duplicate anything sent on a schedule (workflow static data keyed by member + stage) so a
  member never gets the same message twice.

## Validate before shipping
`cd n8n && npm run check` validates every workflow (node types/versions, connections, Code nodes)
and renders all templates to `n8n/preview/` — open a few previews. Workflows are imported in the
n8n UI (credentials: SMTP, Header Auth, Meliora API key, optional Anthropic key).

## AI-written content
Workflows 03 (motivation sentence) and 06 (Instagram ideas) call the Claude API over HTTP. Load
the `claude-api` skill before touching those calls (model id, headers, structured output), and
keep the static fallback so e-mails still go out when the API key is missing or the call fails.

## Never
E-mail real addresses from demo data (seed uses example.com), put secrets in workflow JSON
(use credentials / env), or send marketing to members who are not active without a reason.
