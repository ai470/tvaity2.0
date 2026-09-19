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
git fetch origin main
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
