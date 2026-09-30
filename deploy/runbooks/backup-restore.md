# Backups and restore

## What runs

The `backup` service runs `backup.sh` every 24 hours. It streams `pg_dump --format=custom` through
`openssl enc -aes-256-cbc -pbkdf2 -iter 600000`, keyed by `BACKUP_ENCRYPTION_KEY`, into
`/backups`. The dump never exists unencrypted on disk. It keeps the last 14 locally, each with a
SHA-256 checksum, and uploads both files to S3-compatible storage when `BACKUP_S3_*` is set.

The database holds no prompt or completion content (see `docs/DECISIONS.md`), so backups contain
accounts, hashed keys and request metadata only.

## Key custody

`BACKUP_ENCRYPTION_KEY` is a Phala sealed environment variable: at runtime only the CVM can read
it. For disaster recovery, one escrow copy is held offline, split between two people (for example
2-of-2 Shamir shares or two sealed envelopes in separate safes). Losing both the CVM and the
escrow means losing the backups; that's the intended trade-off.

Rotate the key by deploying with a new value, running a backup, confirming it restores, and then
destroying the old escrow once the retention window has passed.

## Restore drill (monthly, and before each major release)

Locally, against a copy of the schema:

```bash
PGHOST=localhost PGUSER=$USER PGDATABASE=sealcode scripts/backup-drill.sh
```

This backs up with the production script, checks the file is encrypted, restores it into a
scratch database with `restore.sh`, and compares the row count of every table. A drill passed on
30 Sept 2026 (18 tables, all counts matching).

In production, the drill runs in a separate **restore CVM** deployed from the same release with
the same sealed `BACKUP_ENCRYPTION_KEY` and no public ingress:

```bash
restore.sh /backups/sealcode-<stamp>.dump.enc sealcode
```

Record the date, backup file, row counts and result in the incident log.

## Real restore

1. Declare an incident (see `incident.md`) and pause the gateway: `phala cvms stop` or scale the
   gateway service to zero.
2. Copy the latest good backup and its `.sha256` into the CVM's `/backups` volume (from S3 if the
   volume is lost).
3. Run `restore.sh` against the production database.
4. Start the gateway, run `scripts/verify-attestation.ts`, and check a request end to end.
5. Tell customers what changed. Keys revoked after the backup was taken will be active again, so
   re-revoke them from the `admin_events` export.
