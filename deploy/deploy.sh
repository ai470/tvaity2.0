#!/usr/bin/env bash
set -Eeuo pipefail
umask 022

main() {
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
repo=/var/www/tvaity2.0
cd "$repo"
exec 9>/run/lock/tvaity2-deploy.lock
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }

[[ $(git branch --show-current) == main ]] || { echo 'Expected main branch.' >&2; exit 1; }
[[ -z $(git status --porcelain) ]] || { echo 'Working tree is dirty; refusing to overwrite changes.' >&2; exit 1; }
fetched=0
for attempt in 1 2 3; do
    if timeout 30 git fetch origin main; then
        fetched=1
        break
    fi
    echo "GitHub fetch attempt $attempt failed; production is unchanged." >&2
done
[[ $fetched -eq 1 ]] || exit 1
git merge --ff-only origin/main
[[ $(git rev-parse HEAD) == $(git rev-parse origin/main) ]] || {
    echo 'Local main differs from origin/main; refusing to deploy.' >&2
    exit 1
}

# Read the updated implementation only after fetching; keep the lock across exec.
exec bash "$repo/deploy/release.sh"
}

# Parse the whole function before git can replace this script on disk.
main "$@"
