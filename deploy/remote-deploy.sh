#!/usr/bin/env bash
# Runs on the server from <DEPLOY_PATH>/<environment>, called over SSH by .github/workflows/deploy.yml:
# pulls the images built for this commit, restarts the stack, waits for the gateway health check and
# rolls back to the previous release when it does not come up. The registry token arrives on stdin.
#   MELIORA_REGISTRY=ghcr.io/<owner> MELIORA_IMAGE_TAG=<env>-<sha> COMPOSE_PROJECT_NAME=meliora-<env> \
#   GHCR_USER=<github user> bash deploy/remote-deploy.sh <<< "<token>"
set -euo pipefail
cd "$(dirname "$0")/.."

: "${MELIORA_REGISTRY:?}" "${MELIORA_IMAGE_TAG:?}" "${COMPOSE_PROJECT_NAME:?}"
export MELIORA_REGISTRY MELIORA_IMAGE_TAG COMPOSE_PROJECT_NAME

need=2.24.4 # !reset / !override in docker-compose.deploy.yml
have=$(docker compose version --short 2>/dev/null | sed 's/^v//' || true)
if [ -z "$have" ] || [ "$(printf '%s\n%s\n' "$need" "$have" | sort -V | head -n1)" != "$need" ]; then
  echo "Docker Compose >= $need is required on the server (found: ${have:-none})" >&2
  exit 1
fi
[ -f .env ] || { echo "Missing $(pwd)/.env" >&2; exit 1; }

compose() { docker compose -f docker-compose.yml -f docker-compose.deploy.yml "$@"; }

token=""
IFS= read -r token || true
if [ -n "$token" ] && [ -n "${GHCR_USER:-}" ]; then
  printf '%s' "$token" | docker login ghcr.io -u "$GHCR_USER" --password-stdin >/dev/null
  trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
fi

release() { # pull and (re)start one image tag
  MELIORA_IMAGE_TAG="$1" compose pull --quiet
  MELIORA_IMAGE_TAG="$1" compose up -d --remove-orphans --no-build
}

healthy() { # the gateway answers and every service is "up" (3 minutes max)
  local out
  for _ in $(seq 1 60); do
    out=$(compose exec -T api-gateway wget -qO- http://127.0.0.1:4000/api/health 2>/dev/null || true)
    if [[ $out == *'"status":"ok"'* && $out != *'"down"'* ]]; then
      echo "$out"
      return 0
    fi
    sleep 3
  done
  return 1
}

previous=$(cat .deployed-tag 2>/dev/null || true)
echo "Deploying $MELIORA_IMAGE_TAG as $COMPOSE_PROJECT_NAME (previous: ${previous:-none})"
release "$MELIORA_IMAGE_TAG"
if out=$(healthy); then
  echo "$MELIORA_IMAGE_TAG" > .deployed-tag
  echo "Healthy: $out"
  docker image prune -af --filter "until=168h" >/dev/null || true
  exit 0
fi

echo "Health check failed for $MELIORA_IMAGE_TAG" >&2
compose ps >&2 || true
compose logs --no-color --tail 60 >&2 || true
if [ -n "$previous" ] && [ "$previous" != "$MELIORA_IMAGE_TAG" ]; then
  echo "Rolling back to $previous" >&2
  release "$previous"
  if healthy >/dev/null; then echo "Rolled back to $previous" >&2; else echo "The rollback is unhealthy too" >&2; fi
fi
exit 1
