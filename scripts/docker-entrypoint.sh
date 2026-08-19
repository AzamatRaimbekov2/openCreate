#!/bin/sh
# Railway (and any host that mounts a volume root-owned) hands us /app/data
# owned by uid 0, while the process itself must run as the unprivileged `node`
# user — the first SQLite write then dies with SQLITE_CANTOPEN and the deploy
# never goes healthy (railway-deployment R1). So PID 1 starts as root, fixes
# the ownership of the mount, and immediately drops back to `node` before
# exec-ing the server: nothing application-level ever runs privileged.
set -e

DATA_DIR="${DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR"

# Recurse only when the mount root is not already ours — on an existing volume
# that is every boot after the first, and a full chown -R over a media
# directory is not something to pay for on every restart.
if [ "$(stat -c %u "$DATA_DIR")" != "1000" ]; then
  chown -R node:node "$DATA_DIR"
fi

# setpriv keeps our PID (so signals and the exit code still reach the server).
# chroot --userspec is the coreutils fallback with the same property.
if command -v setpriv >/dev/null 2>&1; then
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi
exec chroot --userspec=node:node / "$@"
