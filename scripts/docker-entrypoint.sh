#!/bin/sh
set -eu

storage_root="${RAILWAY_VOLUME_MOUNT_PATH:-${UPLOAD_DIR:-/app/.data}}"
mkdir -p "${storage_root}/uploads"
chown -R nextjs:nodejs "${storage_root}"

exec su-exec nextjs:nodejs "$@"
