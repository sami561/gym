#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu/Debian server for the deploy pipeline. Run it as root, with the
# PUBLIC half of the deploy key (the private half goes into the GitHub environment secret):
#   sudo bash server-setup.sh "ssh-ed25519 AAAA… meliora-deploy"
# Installs Docker Engine + the compose plugin, creates the "deploy" user (SSH key only, docker group)
# and /opt/meliora. Note: the docker group is root-equivalent — keep that key for the pipeline only.
set -euo pipefail

PUBKEY="${1:?usage: sudo bash server-setup.sh \"ssh-ed25519 AAAA… meliora-deploy\"}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/meliora}"

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version

id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"

home=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh"
touch "$home/.ssh/authorized_keys"
grep -qxF "$PUBKEY" "$home/.ssh/authorized_keys" || echo "$PUBKEY" >> "$home/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$home/.ssh/authorized_keys"
chmod 600 "$home/.ssh/authorized_keys"

install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_PATH"

cat <<EOF

Server ready. GitHub → Settings → Environments → <sandbox|prod> → secrets:
  SSH_HOST         this server's IP or DNS name
  SSH_USER         $DEPLOY_USER
  SSH_PRIVATE_KEY  the private deploy key
  SSH_KNOWN_HOSTS  output of: ssh-keyscan -H <SSH_HOST>   (run from your own machine)
Firewall: open SSH and the web port(s) only — keep 4000 (gateway) and 5678 (n8n) closed.
EOF
