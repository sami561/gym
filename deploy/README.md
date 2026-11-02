# Release flow and deployment

```
work branch ──PR/merge──▶ sandbox ──▶ prod ──▶ main
 feat/… fix/…            deploys to       deploys to     records what
 docs/… chore/…          the sandbox      production     is released
 build/… test/… ci/…     server           (approval)
```

| Workflow | When | What |
|---|---|---|
| `CI` (`.github/workflows/ci.yml`) | every push to a work branch or `main`; called by `Deploy` | backend typecheck + unit tests + build of the 11 apps, web lint + tests + build, mobile typecheck + lint + tests, door-agent typecheck + tests + build, n8n workflow validation, docker compose validation, actionlint on the workflows |
| `Branch flow` (`branch-flow.yml`) | PRs into `sandbox`/`prod`/`main`, pushes to `prod`/`main` | PRs only go one stage forward; `prod`/`main` only contain commits that went through the previous stage |
| `Quality` (`quality.yml`) | pushes, PRs, weekly | conventional commit messages, branch names, secret scan (gitleaks), dependency audit report |
| `Deploy` (`deploy.yml`) | push to `sandbox` or `prod`, or "Run workflow" on one of them | CI → Docker images (`ghcr.io/<owner>/meliora-{backend,web,door-agent}`, tags `<env>-<sha>` and `<env>`) → SSH deploy with health check and automatic rollback |

`main` is not deployed. Nothing is pushed to a server until the environment is switched on
(`DEPLOY_ENVIRONMENTS`, below): before that, `Deploy` only builds the images to check them.

## Promote a change

On GitHub: open a PR from the work branch into `sandbox` and merge it (merge commit, not squash
or rebase — squashed commits look like commits that skipped a stage). When sandbox is good, open
a PR `sandbox → prod`, then `prod → main`.

From a terminal (what Claude does; fast-forward only, so nothing is rewritten):
```bash
git fetch origin
git checkout sandbox && git pull && git merge --no-ff feat/my-change && git push origin sandbox
git fetch . sandbox:prod && git push origin prod     # release
git fetch . prod:main && git push origin main        # record the release
```

## Set up a server (once per environment)

1. **Deploy key** on your own machine: `ssh-keygen -t ed25519 -f meliora-deploy -C meliora-deploy -N ""`.
2. **Server** (Ubuntu/Debian, 2 vCPU / 4 GB is enough for one environment): copy
   `deploy/server-setup.sh` to it and run `sudo bash server-setup.sh "$(cat meliora-deploy.pub)"`.
   It installs Docker + compose, creates the `deploy` user and `/opt/meliora`.
3. **GitHub → Settings → Environments → New environment** `sandbox` (then `prod`):
   - Secrets:

     | Secret | Value |
     |---|---|
     | `SSH_HOST` | server IP or DNS name |
     | `SSH_USER` | `deploy` |
     | `SSH_PRIVATE_KEY` | content of `meliora-deploy` (the private key) |
     | `SSH_KNOWN_HOSTS` | output of `ssh-keyscan -H <SSH_HOST>` (pins the server key) |
     | `SSH_PORT` | only if SSH is not on 22 |
     | `ENV_FILE` | the whole `.env` of that environment, built from `.env.example` with real values (generate every secret with `openssl rand -hex 32`). Optional if you create `/opt/meliora/<env>/.env` on the server yourself |
   - Variables: `PUBLIC_URL` (e.g. `https://sandbox.meliora-gym.tn`, used for the smoke test and the
     link on the deployment), `DEPLOY_PATH` (default `/opt/meliora`).
   - For `prod`: **Required reviewers** (you approve every production deploy) and
     **Deployment branches: selected → `prod`**. For `sandbox`: deployment branch `sandbox`.
4. **GitHub → Settings → Secrets and variables → Actions → Variables** (repository):
   `DEPLOY_ENVIRONMENTS` = `sandbox` (then `sandbox,prod`). Optional: `IMAGE_PLATFORMS`
   (`linux/arm64` for ARM servers), `VITE_APP_STORE_URL`, `VITE_PLAY_STORE_URL`.
5. Push to `sandbox` (or "Run workflow" on it) and watch `Deploy`.

Never paste these secrets in a chat, an issue or a commit — only in GitHub's encrypted secrets.

### Both environments on one server
Give each `ENV_FILE` its own ports and put a TLS reverse proxy (Caddy, Traefik, nginx) in front:

| | `WEB_PORT` | `GATEWAY_HOST_PORT` | `N8N_PORT` |
|---|---|---|---|
| prod | 8080 | 4000 | 5678 |
| sandbox | 8081 | 4001 | 5679 |

```
# /etc/caddy/Caddyfile — automatic HTTPS
meliora-gym.tn          { reverse_proxy 127.0.0.1:8080 }
sandbox.meliora-gym.tn  { reverse_proxy 127.0.0.1:8081 }
```
Each environment is its own compose project (`meliora-sandbox`, `meliora-prod`) with its own
volumes, databases and n8n. The gateway (`GATEWAY_BIND`) and n8n (`N8N_BIND`) listen on
127.0.0.1 only; open the n8n editor through a tunnel: `ssh -L 5678:127.0.0.1:5678 deploy@<host>`.

## What a deploy does on the server
`deploy/remote-deploy.sh`, from `/opt/meliora/<env>`:
`docker compose -f docker-compose.yml -f docker-compose.deploy.yml pull` → `up -d` → waits up to
3 minutes for `GET /api/health` to report every service `up` → records the tag in `.deployed-tag`.
If the health check fails it prints the logs and redeploys the previous tag, and the workflow fails.

- Redeploy: "Run workflow" on the branch, or re-run an older successful `Deploy` run.
- Roll back by hand: `cd /opt/meliora/<env> && MELIORA_REGISTRY=ghcr.io/<owner> MELIORA_IMAGE_TAG=<old tag> COMPOSE_PROJECT_NAME=meliora-<env> bash deploy/remote-deploy.sh < /dev/null`
  (log in to ghcr.io first if the images are private).
- Databases: schemas come from TypeORM synchronize (`DB_SYNCHRONIZE`), there are no migrations
  yet — back up the `pgdata` volume before releases that change entities.

Not covered here: the mobile app (built and published with EAS / the stores) and the door agent,
which runs at the gym (`docker compose --profile agent up -d door-agent` with the published
`meliora-door-agent` image, see `door-agent/README.md`).

## Recommended GitHub settings
- Branch protection for `sandbox`, `prod` and `main`: block force pushes and deletion; require
  the status checks `branch order` (PRs) and the CI jobs; for `prod`/`main`, require a PR.
- Packages: images are private when the repository is; the deploy logs in with the workflow token.
