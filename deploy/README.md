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

### A server shared with other applications
- Take ports nobody uses (`ss -ltn`): the sandbox set above also works when another application
  holds 4000 or 8080. Only the web port needs to be open in the cloud firewall.
- A reverse proxy that runs in Docker cannot reach a port published by another compose project:
  Docker isolates the networks. Put the `web` service on the proxy's network instead, or open the
  web port in the firewall.
- A deploy removes only the older images of its own environment (`<env>-*` tags), never the images
  of other applications.
- The `deploy` user is in the `docker` group: it can control every container of the host, the
  other applications' included. Keep its key for the pipeline only.

### Deploy by hand (before the pipeline is set up)
Builds the images on the server and runs them with the same compose files as the pipeline, which
later takes over the same project and volumes. From your clone:
```bash
git archive sandbox | ssh <user>@<host> 'mkdir -p /opt/meliora/sandbox && tar -x -C /opt/meliora/sandbox'
```
On the server, in `/opt/meliora/sandbox`: `.env` from `.env.example`, every secret from
`openssl rand -hex 32`, `CORS_ORIGINS` = the site's address, plus
```
COMPOSE_PROJECT_NAME=meliora-sandbox
COMPOSE_FILE=docker-compose.yml:docker-compose.deploy.yml
MELIORA_REGISTRY=meliora.local      # a registry host that does not exist: never pulled from anywhere
MELIORA_IMAGE_TAG=sandbox-<first 12 characters of the commit>
WEB_PORT=8081
GATEWAY_HOST_PORT=4001
N8N_PORT=5679
```
then
```bash
for app in backend web door-agent; do docker build -t "meliora.local/meliora-$app:$(grep -m1 '^MELIORA_IMAGE_TAG=' .env | cut -d= -f2)" "$app"; done
docker compose up -d --no-build
bash deploy/n8n-setup.sh     # once n8n answers: curl -s 127.0.0.1:5679/healthz
```
When the pipeline takes over: `sudo chown -R deploy:deploy /opt/meliora/sandbox`, and leave the
`ENV_FILE` secret empty so the server keeps this `.env` (the database volume was created with its
`POSTGRES_PASSWORD`, and n8n encrypts its credentials with `N8N_ENCRYPTION_KEY`).

### Demo data (sandbox only)
The images do not contain `backend/scripts`; run the seed from a one-off container (the folder is
on the server after a `git archive` upload, copy it there otherwise):
```bash
docker compose run --rm --no-deps -T -v "$PWD/backend/scripts:/app/scripts:ro" \
  -e SEED_API_URL=http://api-gateway:4000 api-gateway node scripts/seed.js
```
It prints the demo logins and the key of the demo door agent ("PC accueil"): put that key in
`DOOR_AGENT_KEY` and start the agent with `docker compose --profile agent up -d door-agent`.

### n8n on a server
`bash deploy/n8n-setup.sh` imports the workflows n8n does not have yet (switched off) and creates
the three credentials whose values are in `.env`. Then, in the editor through the tunnel: create
the owner account and the `Meliora SMTP` credential, and activate the workflows (`n8n/README.md`).

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
