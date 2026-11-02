#!/usr/bin/env bash
# Sets up n8n once the stack runs, from <DEPLOY_PATH>/<environment> (the Deploy workflow copies this
# script there):
#   bash deploy/n8n-setup.sh [compose project, default meliora-<folder name>]
# - imports the workflows of n8n/workflows that n8n does not have yet (matched by name), switched off;
# - creates or updates the three credentials whose values are in .env: "Meliora webhook
#   (Authorization)", "Meliora webhook signature" and "Meliora automation API (x-api-key)".
# Then in the editor (ssh -L 5678:127.0.0.1:<N8N_PORT> <user>@<host>, http://localhost:5678): create
# the owner account and the "Meliora SMTP" credential (plus "Anthropic API (x-api-key)" for workflows
# 03 and 06), and activate the workflows (n8n/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "Missing $(pwd)/.env" >&2; exit 1; }

project=${1:-meliora-$(basename "$(pwd)")}
container=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter "label=com.docker.compose.service=n8n")
[ -n "$container" ] || { echo "No running n8n container in the compose project $project" >&2; exit 1; }
in_n8n() { docker exec -i "$container" "$@"; }

value() { # a variable of .env, checked so it can go into JSON as is; never printed
  local v
  v=$(grep -m1 "^$1=" .env | cut -d= -f2-) || true
  [[ $v =~ ^[A-Za-z0-9._~+/=-]{32,}$ ]] || { echo "$1 in .env must be at least 32 characters of [A-Za-z0-9._~+/=-] (openssl rand -hex 32)" >&2; return 1; }
  printf '%s' "$v"
}
auth_token=$(value WEBHOOK_AUTH_TOKEN)
signing_secret=$(value WEBHOOK_SECRET)
api_key=$(value AUTOMATION_API_KEY)

existing=$(in_n8n n8n list:workflow </dev/null 2>/dev/null | cut -d'|' -f2-)
for file in $(in_n8n sh -c 'ls /workflows/*.json' </dev/null); do
  name=$(in_n8n node -e 'process.stdout.write(require(process.argv[1]).name)' "$file" </dev/null)
  if grep -qxF "$name" <<< "$existing"; then
    echo "kept       $name"
  else
    in_n8n n8n import:workflow --input="$file" </dev/null >/dev/null 2>&1
    echo "imported   $name (switched off)"
  fi
done

# Ids as referenced by the workflow files; the Crypto credential keeps its secret in hmacSecret.
printf '[{"id":"meliora-webhook-auth","name":"Meliora webhook (Authorization)","type":"httpHeaderAuth","data":{"name":"Authorization","value":"Bearer %s"}},{"id":"meliora-webhook-signature","name":"Meliora webhook signature","type":"crypto","data":{"hmacSecret":"%s"}},{"id":"meliora-automation-api","name":"Meliora automation API (x-api-key)","type":"httpHeaderAuth","data":{"name":"x-api-key","value":"%s"}}]' \
  "$auth_token" "$signing_secret" "$api_key" |
  in_n8n sh -c 'umask 077; f=$(mktemp); cat > "$f"; n8n import:credentials --input="$f" >/dev/null 2>&1; rc=$?; rm -f "$f"; exit $rc'
echo "credentials Meliora webhook (Authorization), Meliora webhook signature, Meliora automation API (x-api-key): created or updated"
