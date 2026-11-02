# Contributing

The engineering rules of the Meliora Gym platform, for people and for Claude. Background:
[README.md](README.md) · area guides: `CLAUDE.md` in each folder · API contract: [docs/API.md](docs/API.md)
· servers and promotions: [deploy/README.md](deploy/README.md).

## Release flow

```
work branch ──PR──▶ sandbox ──PR──▶ prod ──PR──▶ main
feat/… fix/…        deploys the       deploys production   records what
                    sandbox server    (after approval)     is released
```

- One branch per task, from `main`: `git checkout main && git pull && git checkout -b feat/waitlist-emails`.
- Branch name `<type>/<topic>`: type `feat`, `fix`, `docs`, `chore`, `build`, `ci`, `refactor`, `test`,
  `perf` or `revert`, topic in lower-case kebab-case. `dependabot/…` branches are Dependabot's.
- Commit each finished, verified piece and push right away.
- Work branch → `sandbox` through a PR (or `git merge --no-ff`) with a **merge commit**: never squash
  or rebase, rewritten commits look like commits that skipped a stage to the branch-order check.
- `sandbox → prod` (release) and `prod → main` (record it): PRs or the fast-forward commands of
  deploy/README.md, with green checks and the change tried on the sandbox server.
- A production fix takes the same path (`fix/…` → sandbox → prod → main), just faster. Nothing is
  committed on `sandbox`, `prod` or `main` directly, and they are never force-pushed.

## Commits

`type(scope): subject`, e.g. `feat(class-service): waitlist with automatic promotion`.

| Type | For |
|---|---|
| `feat` / `fix` | a new capability / a bug fix |
| `docs` / `test` | documentation only / tests only |
| `refactor` / `perf` / `style` | same behaviour: restructured / faster / formatting only |
| `build` | Dockerfiles, build config, runtime dependencies (what ships) |
| `ci` | GitHub Actions workflows |
| `chore` | tooling that does not ship: dev dependencies, editor and repo config |
| `revert` | undoes an earlier commit |

- Scope = the area changed: `backend` (shared lib or several services), `api-gateway`,
  `<name>-service`, `web`, `mobile`, `door-agent`, `n8n`, `docker`, `deploy`, `ci`, `claude`, `docs`,
  `deps` for dependency updates. Lower-case letters, digits and `-`; omit it only for repo-wide changes.
- Subject in English, imperative, ≤ 72 characters, no final period. A breaking change gets `!`
  (`feat(api-gateway)!: …`) and a `BREAKING CHANGE:` paragraph in the body.
- Body: what changed, why, and what you verified. Claude adds its `Co-Authored-By` trailer.
- `git revert` writes `Revert "…"`: reword it to `revert(scope): …`. GitHub's Revert button creates
  a `revert-<n>-…` branch and message that fail the checks: revert on a `revert/<topic>` branch.
- Squash fixups before merging: `git rebase -i --autosquash origin/sandbox`, then
  `git push --force-with-lease` (your own work branch only).

## Definition of done

1. **Tests next to the logic**: every new or changed rule has unit tests beside it (backend
   `*.spec.ts`, web and mobile `*.test.ts(x)`, door agent `test/*.test.ts`) checking inputs → outputs,
   edge cases and error paths, not restating the code. A bug fix comes with the test that catches it.
2. **Green checks** for every folder touched: typecheck, lint, tests, build ([Checks](#checks)).
3. **Contract first** for API changes: `backend/libs/common/src` (contracts, patterns, events) →
   services → gateway → `docs/API.md` → web `src/api/types*.ts` and mobile `src/api/types.ts`.
4. **Three languages**: every user-facing string in French (reference), English and Arabic, RTL
   checked. Error messages from the server are French.
5. **No secrets**: nothing secret in code, commits or logs; a new setting goes into the matching
   `.env.example` with an empty or `change-me-…` value and a comment.
6. **Fake data only**: demo and test data use `@example.com` addresses (n8n sends real e-mails) and
   no real member data.
7. **Docs follow**: README, the area `CLAUDE.md`, `deploy/README.md` when setup, commands or
   behaviour change.
8. **Tried for real** when runtime behaviour changes: build, start, call it through the gateway, open
   the screen.

## Code rules

### Everywhere
- `.editorconfig`: UTF-8, LF, 2-space indent, final newline, no trailing spaces.
- Identifiers and comments in English; comments are sparse and say why, not what.

### Backend (`backend/`, NestJS)
- Thin controllers: `@MessagePattern(PATTERNS…)` / `@EventPattern(EVENTS…)` with a `@Payload()` typed
  by the contract. Logic and SQL in services; pure rules in small files with a `*.spec.ts` beside them.
- A service never reads another service's database: call its patterns or keep a read model fed by
  its events.
- Errors are Nest `HttpException`s with French messages (`new NotFoundException('Membre introuvable')`).
- Map entities to DTOs explicitly; never return or log secrets (`passwordHash`, `accessSecret`,
  `keyHash`, tokens).
- Outbound HTTP to a URL from configuration or data (automations, webhooks, door relays):
  `parseOutboundUrl` + `assertOutboundAllowed` from `@app/common` right before the call, and
  `fetch(…, { redirect: 'manual' })`.
- Event handlers are idempotent and accept out-of-order delivery (unique keys, upserts); optional
  reads from other services degrade gracefully.
- Gateway: class-validator DTOs, `@Roles` / `@Public` / `@ApiKeyAuth` on every route, `ParseUUIDPipe`
  on ids, `toActor(user)`; `/api/me/*` always uses the token's user id.
- Money as numbers (TND, 3 decimals), instants as ISO strings (`timestamptz`), gym days as
  `YYYY-MM-DD` in `Africa/Tunis` (`date`), `decimalTransformer` on numeric columns.
- `libs/common/src/utils/access-code.ts` and `mobile/src/lib/accessCode.ts` change together and
  stay identical in behaviour.

### Web (`web/`) and mobile (`mobile/`)
- API types mirror the backend contracts by hand (web `src/api/types*.ts`, mobile `src/api/types.ts`;
  never import from `../backend`) and change in the same branch as the contract.
- Every string through i18n. Web: keys in `src/i18n/landing.ts`, back office French text as key in
  `src/i18n/messages/admin.ts`. Mobile: key in `src/i18n/fr.ts` first, then `en.ts` and `ar.ts` with
  the same placeholders.
- RTL with logical properties only: web `ms-/me-`, `ps-/pe-`, `start-/end-`, `text-start`; mobile
  `start`/`end`, `marginStart`, `mirrorInRTL`, text through `AppText`. Money and dates through the
  format helpers, Latin digits.
- Web: charts keep a table view and no dual axis; the Three.js hero stays lazy with its fallback;
  real gym photos only.
- Mobile: add packages with `npx expo install`, never `npm install`; data through the hooks of
  `src/hooks/queries.ts`; tokens only through `src/lib/storage.ts` (SecureStore);
  `useReducedMotion()` for looping animations.

### Door agent (`door-agent/`)
- One ZKTeco command at a time through the queue; never block the event loop.
- Always ack `door.open`, errors included (the server waits 8 s otherwise).
- The offline punch buffer (`DATA_DIR`) stays readable by the next version.
- Protocol changes start in `docs/API.md` (door agents); test with `npm run mock-server`, no hardware.

### n8n (`n8n/`)
- Workflows are importable exports in `workflows/*.json`, French templates in `templates/`; run
  `npm run check` after each change and open a few previews.
- Exports reference credentials by name, never hold them; URLs come from `$env`.
- Every AI-written text has a static fallback; test sends go to `@example.com` only.

## Security
- Secrets live in ignored `.env` files and GitHub encrypted secrets, nowhere else: not in code,
  commits, issues, PRs, logs or chats. Generate them with `openssl rand -hex 32`; the backend refuses
  example and weak values in production.
- Never paste a `.env` file or a secret into a chat or an AI tool (Claude may not read `.env` files:
  `.claude/settings.json`); never commit `*.pem` / `*.key`.
- Test keys are generated in the test (`crypto.generateKeyPairSync`); the secret scan only tolerates
  generic fake values in test files.
- **A secret that reached GitHub is compromised**: revoke and replace it first, then clean the
  history with `git filter-repo` together with the owner, and have everyone re-clone.
- Each new route has a role or an explicit `@Public()` / `@ApiKeyAuth()`, and validates its input.
- Member data (names, phones, e-mails, measurements) stays in the databases: not in logs,
  screenshots, issues or fixtures.
- Dependencies: add them with an exact version (`npm install --save-exact`, mobile through
  `npx expo install`) and commit the lockfile with them. Fix high or critical advisories of the
  weekly audit in a `fix/…` branch.

## Checks

| Workflow | Runs | Checks |
|---|---|---|
| `CI` | pushes (sandbox and prod inside `Deploy`) | typecheck, lint, tests, build per folder; compose files; actionlint |
| `Branch flow` | PRs, pushes to prod / main | PRs move one stage forward; prod / main only hold commits of the previous stage |
| `Quality` | pushes, PRs, Mondays | commit messages, branch name, secret scan (gitleaks); dependency audit (report only) |

All of them must pass before a merge, except the dependency audit. Run them locally first:

```bash
# CI, from the repo root (after a pull or a package-lock.json change: `npm ci` in that folder first)
(cd backend    && npm run typecheck && npm run lint && npm test -- --ci && npm run build)
(cd web        && npm run lint && npm test && npm run build)
(cd mobile     && npm run typecheck && npm run lint && npm test)   # Node ≥ 22.13
(cd door-agent && npm run typecheck && npx tsc -p test/tsconfig.json && npm test && npm run build)
(cd n8n        && npm run check)
docker compose config --quiet    # reads your .env
MELIORA_REGISTRY=ghcr.io/ci MELIORA_IMAGE_TAG=ci docker compose -f docker-compose.yml -f docker-compose.deploy.yml config --quiet
docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7 -color
for f in deploy/*.sh; do bash -n "$f"; done

# Quality: commits to reword (prints nothing when all are fine), then the branch name
git log --no-merges --format='%h %s' origin/sandbox..HEAD \
  | grep -Ev '^[0-9a-f]+ (feat|fix|docs|chore|build|ci|refactor|test|perf|style|revert)(\([a-z0-9-]+\))?!?: .+'
git branch --show-current | grep -Ex '(feat|fix|docs|chore|build|ci|refactor|test|perf|revert|dependabot)/.+'
# secrets (brew install gitleaks): staged changes before a commit, then every commit like CI
gitleaks git --pre-commit --staged --config .gitleaks.toml --redact --verbose .
gitleaks git --config .gitleaks.toml --redact --verbose .
# production dependencies
for d in backend web mobile door-agent; do (cd "$d" && npm audit --omit=dev --audit-level=high); done
```

To run the staged secret scan before each commit, once per clone:
`printf '#!/bin/sh\nexec gitleaks git --pre-commit --staged --redact --verbose --no-banner .\n' > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit`.

## Pull requests and review

The PR template holds the target branch, what and why, how it was tested and the definition of done.
The reviewer also checks:
- it does what the PR says, errors and empty states included, with gym edge cases in mind (time zone,
  TND rounding, frozen or expired memberships, door agent offline);
- the tests fail without the change and read as examples of the rule;
- contract, `docs/API.md`, gateway DTOs and the web / mobile types agree;
- roles on new routes, no secret or personal data in responses or logs, outbound URLs through the
  guard, idempotent event handlers;
- FR / EN / AR present, RTL layout right, no hard-coded text;
- a new dependency is worth it, and docs and `.env.example` follow.

Dependabot PRs (Mondays, into `sandbox`) are reviewed the same way: read the changelog for majors,
open the app for mobile and web updates. In mobile it leaves Expo SDK upgrades, React and React
Native alone: they move together with `npx expo install expo@^<sdk> --fix`. Packages that only work
at the same major (Nest, ESLint, Jest, Vite, React, the `docker/*` actions) come in one PR, and
TypeScript majors are left for a planned upgrade of the whole repo (`.github/dependabot.yml`). A
`docker/*` action update is only exercised by the Deploy run on `sandbox`: watch that run. Security
update PRs open on `main`: change their base to `sandbox`.
