#!/bin/sh
# Backup restore drill: back up a database with deploy/backup/backup.sh, restore the encrypted file
# into a scratch database with restore.sh, and compare row counts for every table.
#
#   PGHOST=localhost PGUSER=$USER PGDATABASE=sealcode scripts/backup-drill.sh
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
export BACKUP_DIR="$work" BACKUP_KEEP=3
export BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-drill-$(openssl rand -hex 32)}"
source_db="${PGDATABASE:-sealcode}"
scratch="${source_db}_restore_drill"

"$here/deploy/backup/backup.sh" --once
file=$(ls -1 "$work"/sealcode-*.dump.enc | head -1)
echo "encrypted backup: $(basename "$file") ($(wc -c < "$file" | tr -d ' ') bytes)"
if head -c 5 "$file" | grep -q PGDMP; then echo "FAIL: backup is not encrypted"; exit 1; fi

dropdb --if-exists "$scratch"
createdb "$scratch"
"$here/deploy/backup/restore.sh" "$file" "$scratch"

count() {
  psql -d "$1" -Atc "select string_agg(t || '=' || n, ' ' order by t) from (select relname as t, (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.' || quote_ident(relname), false, true, '')))[1]::text::int as n from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace) s"
}
before=$(count "$source_db")
after=$(count "$scratch")
dropdb "$scratch"
if [ "$before" = "$after" ]; then
  echo "PASS: restored row counts match ($before)"
else
  echo "FAIL: row counts differ"; echo "source:   $before"; echo "restored: $after"; exit 1
fi
