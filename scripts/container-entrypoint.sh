#!/bin/sh
# M7 A-REL-1: initialize the mounted volume, then drop privileges before app/DB work.
set -eu
if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/.data
  chown node:node /app/.data
  chmod 700 /app/.data
  exec gosu node "$@"
fi
exec "$@"
