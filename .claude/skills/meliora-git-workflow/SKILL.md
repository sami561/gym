---
name: meliora-git-workflow
description: Git and release rules for the Meliora Gym repo — new branch from main for every change, scoped conventional commits after each finished piece, push right after, then merge into sandbox → prod → main (each stage deploys through GitHub Actions), and how parallel agents share one working tree. Use this before any commit, branch, push, merge, promotion, release or PR in this repo, and whenever starting a new task ("ajoute…", "fix…", "commit", "push", "merge", "release", "deploy"), even if git isn't mentioned.
---

# Meliora git workflow

```
work branch ──▶ sandbox ──▶ prod ──▶ main
(feat/…)        deploys      deploys     records what
                sandbox      production  is released
```
The owner wants every change committed and pushed, never directly on `sandbox`, `prod` or `main`,
and every change to go through the three stages in that order. CI, the branch-order check and the
deploys are GitHub Actions (`.github/workflows/`, `deploy/README.md`).

## For each new task
```bash
git checkout main && git pull
git checkout -b <type>/<topic>      # feat/…, fix/…, docs/…, chore/…, build/…, test/…, refactor/…, ci/…
```
Commit each finished, verified piece (a service, a screen, a fix) — not one giant commit at the
end, and not half-done work. Then push the branch right away:
```bash
git push -u origin <branch>
```
Push needs the SSH key in the agent: if GitHub answers `Permission denied (publickey)`, ask the
user to run `ssh-add --apple-use-keychain ~/.ssh/id_rsa` once; keep committing locally meanwhile.

## Promote
- **sandbox**: merge the finished branch once its checks pass (merge commit, never squash/rebase —
  the branch-order check treats rewritten commits as commits that skipped a stage).
- **prod** and **main**: when the user asks for a release / to ship it. Fast-forward only, so the
  three branches end on the same commit:
```bash
git fetch origin
git checkout sandbox && git pull && git merge --no-ff <branch> && git push origin sandbox
git fetch . sandbox:prod && git push origin prod
git fetch . prod:main && git push origin main
```
When agents are editing the working tree, merge without checking out (the tree stays untouched):
```bash
tree=$(git merge-tree --write-tree sandbox <branch>)            # exits 1 on conflicts
commit=$(git commit-tree "$tree" -p sandbox -p <branch> -m "Merge branch '<branch>' into sandbox")
git update-ref refs/heads/sandbox "$commit" "$(git rev-parse sandbox)" && git push origin sandbox
```
Never force-push, never commit on `sandbox`/`prod`/`main` directly, never promote over a red CI.
A push to `sandbox`/`prod` runs `Deploy` (CI → images → server); watch it and report the result.

## Commit messages
Conventional commits with a scope, subject in English, imperative, ≤ 72 chars, body explaining
what changed and why (bullets are fine), and the Claude co-author trailer when Claude wrote it.
Types: feat, fix, docs, chore, build, ci, refactor, test, perf, style, revert (checked by the
`Quality` workflow). Scopes: `backend`, `api-gateway`, `auth-service`, `membership-service`,
`class-service`, `access-service`, `notification-service`, `staff-service`, `facility-service`,
`commerce-service`, `training-service`, `workflow-service`, `web`, `mobile`, `door-agent`, `n8n`,
`docker`, `deploy`, `ci`, `claude`, `docs`.

Example: `feat(class-service): waitlist with automatic promotion`

## Several agents in one working tree
Only the orchestrator runs git. Sub-agents edit only their own folders and report back; the
orchestrator stages **explicit paths** (`git add backend/apps/<svc>`), never `git add -A`, so
work in progress from another agent is not swept into a commit. Never commit `.env`,
`node_modules`, `dist`, `n8n/preview` (all ignored) or generated exports.

## Before committing
Run what CI runs (`.github/workflows/ci.yml`) for the folders you touched, and say in the body
what was verified:
- backend: `npm run typecheck && npm test && npm run build` (or per app: `npx tsc --noEmit -p apps/<app>/tsconfig.app.json`, `npx jest apps/<app>`)
- web: `npm run lint && npm test && npm run build`
- mobile (Node ≥ 22.13): `npm run typecheck && npm run lint && npm test`
- door-agent: `npm run typecheck && npm test && npm run build`
- n8n: `npm run check`
