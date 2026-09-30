#!/bin/sh
# Restore an encrypted backup into a database. Run inside a CVM that holds BACKUP_ENCRYPTION_KEY
# (production, or a restore-drill CVM deployed with the same sealed key).
#
#   restore.sh /backups/sealcode-20261001T020000Z.dump.enc [target-database]
set -eu
file="${1:?usage: restore.sh <file.dump.enc> [database]}"
target="${2:-${PGDATABASE:-sealcode}}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY must be set}"

if [ -f "$file.sha256" ]; then
  (cd "$(dirname "$file")" && sha256sum -c "$(basename "$file").sha256")
fi
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_ENCRYPTION_KEY -in "$file" \
  | pg_restore --no-owner --clean --if-exists --exit-on-error --dbname="$target"
echo "restored $(basename "$file") into $target"
