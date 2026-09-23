#!/bin/sh
# Phase 1.6 — Daily pg_dump sidecar (runs inside a postgres:16-alpine container).
# Keeps BACKUP_KEEP_DAYS days locally; if RCLONE_REMOTE is set (e.g. s3:bucket/txl),
# also copies each dump off-host with rclone (must be present in the image, see
# README). Restore procedure: docs/runbooks/restore-database.md
set -eu
: "${PGHOST:=postgres}" "${PGUSER:=tradexlabel}" "${PGDATABASE:=tradexlabel}" "${BACKUP_KEEP_DAYS:=30}" "${BACKUP_INTERVAL_SECONDS:=86400}"
mkdir -p /backups
while true; do
  stamp=$(date +%F-%H%M)
  out="/backups/db-${stamp}.dump.gz"
  if pg_dump -Fc "$PGDATABASE" | gzip > "$out"; then
    size=$(du -h "$out" | cut -f1)
    echo "[backup] ${out} (${size})"
    if [ -n "${RCLONE_REMOTE:-}" ] && command -v rclone >/dev/null 2>&1; then
      rclone copy "$out" "$RCLONE_REMOTE" && echo "[backup] copied to $RCLONE_REMOTE" || echo "[backup] rclone copy FAILED"
    fi
  else
    echo "[backup] pg_dump FAILED" >&2; rm -f "$out"
  fi
  find /backups -name 'db-*.dump.gz' -mtime +"$BACKUP_KEEP_DAYS" -delete
  sleep "$BACKUP_INTERVAL_SECONDS"
done
