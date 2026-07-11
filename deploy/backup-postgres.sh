#!/bin/sh
set -eu

umask 077
mkdir -p /backups
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="/backups/startrace-${timestamp}.dump"

export PGPASSWORD="${POSTGRES_PASSWORD}"
pg_dump \
  --host=db \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --format=custom \
  --no-owner \
  --file="${target}"

find /backups -type f -name 'startrace-*.dump' -mtime +6 -delete
echo "backup_complete path=${target}"
