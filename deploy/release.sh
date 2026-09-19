#!/usr/bin/env bash
# Internal implementation; invoke deploy.sh so the deployment lock is held.
set -Eeuo pipefail
umask 022
[[ $EUID -eq 0 && -e /proc/$$/fd/9 ]] || { echo 'Use deploy/deploy.sh as root.' >&2; exit 1; }

repo=/var/www/tvaity2.0
state=/var/www/tvaity2.0-deploy
legacy=/var/www/2.tvaity.ru
config=/etc/nginx/sites-available/tvaity2
enabled=/etc/nginx/sites-enabled/tvaity2
cd "$repo"
for command in git tar python3 curl nginx runuser; do command -v "$command" >/dev/null; done
[[ $(readlink -f "$enabled") == "$config" ]] || { echo 'Unexpected enabled nginx configuration.' >&2; exit 1; }
[[ ! -e $state/current || -L $state/current ]] || { echo 'current must be a symlink.' >&2; exit 1; }
nginx -t
for page in reg reg-01; do runuser -u www-data -- test -r "$legacy/$page/index.html"; done

commit=$(git rev-parse HEAD)
id="$(date -u +%Y%m%dT%H%M%S)-${commit:0:12}-$$"
release="$state/releases/$id"
backup="/var/backups/tvaity2-deploy/$id"
install -d -m 0755 "$state" "$state/releases" "$release"
install -d -m 0700 "$backup"
cp -a "$config" "$backup/nginx.conf"
previous=''
if [[ -L $state/current ]]; then
    previous=$(readlink -f "$state/current")
    [[ -d $previous ]] || { echo 'Previous release is missing.' >&2; exit 1; }
fi
printf '%s\n' "$previous" > "$backup/previous-release"
printf '%s\n' "$commit" > "$backup/commit"
(cd "$legacy" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$backup/legacy.sha256"

switched=0
config_changed=0
rollback() {
    status=$?
    trap - EXIT INT TERM
    if (( status != 0 )); then
        echo "Deployment failed; restoring previous release/config. Backup: $backup" >&2
        if (( switched )); then
            if [[ -n $previous ]]; then
                ln -sfn "$previous" "$state/rollback-$$"
                mv -Tf "$state/rollback-$$" "$state/current"
            else
                rm -f "$state/current"
            fi
        fi
        if (( config_changed )); then
            cp -a "$backup/nginx.conf" "$config"
            if nginx -t; then
                systemctl reload nginx || echo 'ERROR: nginx reload after rollback failed.' >&2
            else
                echo 'ERROR: restored nginx configuration failed validation.' >&2
            fi
        fi
    fi
    exit "$status"
}
trap rollback EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# No build or copy takes place in the directory currently served by nginx.
git archive "$commit" short-land sps | tar -x -C "$release"
mv "$release/short-land" "$release/reg-short"
python3 "$repo/deploy/prepare_legacy.py" --root "$legacy" --release "$release"
# Keep content-hashed widget chunks available to already-open legacy pages.
if [[ -n $previous && -d $previous/legacy/_next/static/chunks ]]; then
    cp -an "$previous/legacy/_next/static/chunks/." "$release/legacy/_next/static/chunks/"
fi
find "$release" -type d -exec chmod 0755 {} +
find "$release" -type f -exec chmod 0644 {} +
for page in reg-short sps; do
    test -s "$release/$page/index.html"
    runuser -u www-data -- test -r "$release/$page/index.html"
done

# Check legacy pages and their linked assets before touching nginx/current.
python3 "$repo/deploy/verify.py" --legacy-only --connect-address 127.0.0.1
ln -s "$release" "$state/current-$$"
switched=1
mv -Tf "$state/current-$$" "$state/current"

if ! cmp -s "$repo/deploy/nginx.conf" "$config"; then
    config_changed=1
    install -m 0644 "$repo/deploy/nginx.conf" "$config"
    nginx -t
    systemctl reload nginx
fi

# Both direct-origin TLS and public DNS/HTTPS must serve the expected bytes.
python3 "$repo/deploy/verify.py" --release "$release" --connect-address 127.0.0.1
python3 "$repo/deploy/verify.py" --release "$release"
(cd "$legacy" && sha256sum --check --quiet "$backup/legacy.sha256")
printf '%s\n' "$commit" > "$state/deployed-commit"
printf '%s\n' "$backup" > "$state/last-backup"
echo "Deployed $commit. Release: $release. Rollback backup: $backup"
