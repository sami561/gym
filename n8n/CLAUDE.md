# n8n automations

Workflows in `workflows/*.json` (importable n8n exports), French HTML templates in `templates/`,
validator in `scripts/`. Background, event list and rules: the meliora-n8n-automation skill.

- `npm run check` validates every workflow against n8n-nodes-base 2.45.6 and renders all templates to
  `preview/` (git-ignored) — run it after any change and open a few previews.
- Events arrive on the Webhook node `meliora-events` (Header Auth `Authorization: Bearer <WEBHOOK_SECRET>`),
  feeds come from `$env.MELIORA_API_URL/api/automation/*` with the Meliora API key credential.
- Keep a static fallback for every AI-written text (workflows 03 and 06).
