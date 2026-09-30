#!/bin/sh
# Encrypted Postgres backups, run inside the CVM.
#
# pg_dump (custom format) -> AES-256-CBC with PBKDF2 (openssl) keyed by BACKUP_ENCRYPTION_KEY, a
# sealed environment variable that only this CVM can read. The dump never exists unencrypted on
# disk. Encrypted files go to /backups (a persistent volume) and, if BACKUP_S3_ENDPOINT is set, to
# S3-compatible object storage.
#
#   backup.sh            loop: back up now, then every BACKUP_INTERVAL_SECONDS (default 86400)
#   backup.sh --once     one backup, then exit
set -eu

: "${PGHOST:=postgres}" "${PGUSER:=sealcode}" "${PGDATABASE:=sealcode}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY must be set (sealed env var)}"
: "${BACKUP_DIR:=/backups}" "${BACKUP_KEEP:=14}" "${BACKUP_INTERVAL_SECONDS:=86400}"
export PGHOST PGUSER PGDATABASE

log() { printf '{"ts":"%s","component":"backup","event":"%s"%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${2:-}"; }

backup_once() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  file="$BACKUP_DIR/sealcode-$stamp.dump.enc"
  mkdir -p "$BACKUP_DIR"
  pg_dump --format=custom --no-owner \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 600000 -salt -pass env:BACKUP_ENCRYPTION_KEY -out "$file.partial"
  mv "$file.partial" "$file"
  size=$(wc -c < "$file" | tr -d ' ')
  sha=$(sha256sum "$file" | cut -d' ' -f1)
  printf '%s  %s\n' "$sha" "$(basename "$file")" > "$file.sha256"
  log backup.written ",\"bytes\":$size"

  if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
    : "${BACKUP_S3_BUCKET:?}" "${BACKUP_S3_REGION:?}" "${BACKUP_S3_ACCESS_KEY:?}" "${BACKUP_S3_SECRET_KEY:?}"
    for f in "$file" "$file.sha256"; do
      curl --fail --silent --show-error --aws-sigv4 "aws:amz:$BACKUP_S3_REGION:s3" \
        --user "$BACKUP_S3_ACCESS_KEY:$BACKUP_S3_SECRET_KEY" \
        --upload-file "$f" "$BACKUP_S3_ENDPOINT/$BACKUP_S3_BUCKET/$(basename "$f")" >/dev/null
    done
    log backup.uploaded
  fi

  # Keep the most recent BACKUP_KEEP local copies.
  ls -1t "$BACKUP_DIR"/sealcode-*.dump.enc 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
    rm -f "$old" "$old.sha256"
  done
}

if [ "${1:-}" = "--once" ]; then
  backup_once
  exit 0
fi
while true; do
  backup_once || log backup.failed
  sleep "$BACKUP_INTERVAL_SECONDS"
done
