#!/usr/bin/env bash
# Deploys one commit of main: back up, check out, pull its images, restart, check health.
# Run as root with the full commit SHA, e.g. by GitHub Actions through the deploy user's forced SSH command.
set -euo pipefail
umask 022

CONFIG=/etc/beacon/deploy.env
# shellcheck source-path=SCRIPTDIR source=deploy.env.example
source "$CONFIG"

: "${BEACON_DIR:?BEACON_DIR is not set in $CONFIG}"
: "${BEACON_USER:?BEACON_USER is not set in $CONFIG}"
: "${HEALTH_URL:?HEALTH_URL is not set in $CONFIG}"
BACKUP_SERVICE="${BACKUP_SERVICE-beacon-backup.service}"

sha="${1:-}"
if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "usage: beacon-deploy <full 40-character commit SHA>" >&2
    exit 2
fi

exec 9> /run/lock/beacon-deploy.lock
if ! flock -n 9; then
    echo "Another deploy is already running." >&2
    exit 1
fi

# -H so git reads the owner's config, not root's
as_owner() {
    sudo -u "$BEACON_USER" -H -- "$@"
}

compose() {
    docker compose -f "$BEACON_DIR/compose.yaml" --env-file "$BEACON_DIR/.env" --env-file "$BEACON_DIR/release.env" "$@"
}

echo "==> Fetching main"
as_owner git -C "$BEACON_DIR" fetch --quiet origin main
if ! as_owner git -C "$BEACON_DIR" merge-base --is-ancestor "$sha" origin/main; then
    echo "$sha is not a commit on main, refusing to deploy it." >&2
    exit 1
fi

if [[ -n "$BACKUP_SERVICE" ]]; then
    echo "==> Backing up the database"
    systemctl start "$BACKUP_SERVICE"
fi

echo "==> Checking out $sha"
as_owner git -C "$BEACON_DIR" checkout --quiet --detach "$sha"
printf 'BEACON_VERSION=%s\n' "$sha" > "$BEACON_DIR/release.env"
chown "$BEACON_USER:" "$BEACON_DIR/release.env"

echo "==> Pulling images"
compose pull --quiet api web

echo "==> Starting"
compose up -d --no-build

echo "==> Waiting for $HEALTH_URL"
healthy=false
for _ in $(seq 1 30); do
    # --connect-to sends the request to this server whatever DNS says, but still checks the real certificate
    if curl -fs -m 5 --connect-to ::127.0.0.1: -o /dev/null "$HEALTH_URL"; then
        healthy=true
        break
    fi
    sleep 2
done

if [[ "$healthy" != true ]]; then
    echo "Health check failed. The new version is still running; check 'docker compose logs api' on the server." >&2
    exit 1
fi

echo "==> Removing images unused for a week"
docker image prune -af --filter "until=168h" > /dev/null

echo "==> Deployed $sha"
