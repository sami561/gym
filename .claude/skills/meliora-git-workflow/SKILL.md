---
name: meliora-git-workflow
description: Git rules for the Meliora Gym repo — new branch from main for every change, scoped conventional commits after each finished piece, push right after committing, and how parallel agents share one working tree. Use this before any commit, branch, push, merge or PR in this repo, and whenever starting a new task ("ajoute…", "fix…", "commit", "push", "open a PR"), even if git isn't mentioned.
---

# Meliora git workflow

The owner wants every change committed and pushed, never directly on `main`.

## For each new task
```bash
git checkout main && git pull
git checkout -b <type>/<topic>      # feat/…, fix/…, docs/…, chore/…, build/…
```
Commit each finished, verified piece (a service, a screen, a fix) — not one giant commit at the
end, and not half-done work. Then push the branch right away:
```bash
git push -u origin <branch>
```
Push needs the SSH key in the agent: if GitHub answers `Permission denied (publickey)`, ask the
user to run `ssh-add --apple-use-keychain ~/.ssh/id_rsa` once; keep committing locally meanwhile.
Opening a PR or merging into `main` needs the user's go-ahead.

## Commit messages
Conventional commits with a scope, subject in English, imperative, ≤ 72 chars, body explaining
what changed and why (bullets are fine), and the Claude co-author trailer when Claude wrote it.
Scopes: `backend`, `api-gateway`, `auth-service`, `membership-service`, `class-service`,
`access-service`, `notification-service`, `staff-service`, `facility-service`,
`commerce-service`, `training-service`, `workflow-service`, `web`, `mobile`, `door-agent`, `n8n`,
`docker`, `claude`, `docs`.

Example: `feat(class-service): waitlist with automatic promotion`

## Several agents in one working tree
Only the orchestrator runs git. Sub-agents edit only their own folders and report back; the
orchestrator stages **explicit paths** (`git add backend/apps/<svc>`), never `git add -A`, so
work in progress from another agent is not swept into a commit. Never commit `.env`,
`node_modules`, `dist`, `n8n/preview` (all ignored) or generated exports.

## Before committing
Run what proves the change works: `npx tsc --noEmit -p apps/<app>/tsconfig.app.json`,
`npx jest apps/<app>`, `npm run build` in web, `npx tsc --noEmit && npx expo lint` in mobile,
`npm test` in door-agent, `npm run check` in n8n — and say in the body what was verified.
