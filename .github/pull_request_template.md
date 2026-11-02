<!--
Target branch (the Branch flow check refuses anything else):
  work branch (feat/…, fix/…, docs/…) → sandbox    deploys the sandbox server
  sandbox → prod                                    release: deploys production
  prod → main                                       records the release
Title: type(scope): subject. Merge with "Create a merge commit", never squash or rebase.
Rules and commands: CONTRIBUTING.md
-->

## What and why
<!-- What changes for the owner, the staff or the members, and why. Link the request or issue. -->

## How it was tested
<!-- Commands run, and what you tried on the running stack: routes through the gateway, screens in
     FR / EN / AR, door agent against the mock server, n8n previews… -->

## Checklist
- [ ] Branch `type/topic`, commits `type(scope): subject`
- [ ] New or changed logic has unit tests next to it; a bug fix has the test that catches it
- [ ] Typecheck, lint, tests and build pass for every folder touched
- [ ] API change: contracts in `backend/libs/common/src` first, then services, gateway, `docs/API.md`, web and mobile types
- [ ] User-facing text in French, English and Arabic, RTL checked; server error messages in French
- [ ] No secret or real member data; new settings in `.env.example` (empty or `change-me-…`); demo data on `@example.com`
- [ ] Docs updated when setup, commands or behaviour changed (README, `CLAUDE.md`, `deploy/README.md`)

## Release (sandbox → prod and prod → main only, delete otherwise)
- [ ] Every change below was tried on the sandbox server
- [ ] Entities changed? `pgdata` backed up before the deploy (no migrations yet)
- [ ] Previous image tag noted for a rollback (deploy/README.md)

<!-- Changes released: -->
