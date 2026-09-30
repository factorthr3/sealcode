# Deploying Sealcode to a Phala Confidential VM

One CVM runs everything in `docker-compose.yml`: TLS ingress, gateway, web app, migrations,
Postgres and backups. The compose file is measured into the attestation, so it is only ever
deployed from a release tag, with every image pinned by digest.

## What you need

- A Phala Cloud account and the CLI: `npm i -g phala` then `phala auth login`.
- The `sealcode.dev` zone on Cloudflare, and an API token scoped to **Zone:DNS:Edit** for it.
- A Phala Confidential AI API key (the gateway's upstream credential).
- A Resend account with `sealcode.dev` verified, for transactional email.
- Optionally, an S3-compatible bucket for off-site backup copies.

## 1. Cut a release

Images are built and pinned by CI, never by hand:

```bash
git tag v1.0.0-rc.1 && git push origin v1.0.0-rc.1
```

The `release` workflow builds the gateway, web and backup images reproducibly
(`SOURCE_DATE_EPOCH` from the commit, `rewrite-timestamp=true`), pushes them to GHCR and opens a
pull request. That PR writes the digests into `deploy/docker-compose.yml` and sets `x-release` to
the release name. Review it, merge it, and tag the merge commit `v1.0.0`. That tag is what
customers verify against.

## 2. Prepare the sealed environment

```bash
cp deploy/sealed.env.example /secure/location/sealcode.env   # never inside the repo
# fill it in; generate secrets with: openssl rand -base64 48
```

Store `BACKUP_ENCRYPTION_KEY` in the offline escrow as well (see
`runbooks/backup-restore.md`). No other secret needs to exist outside the CVM.

## 3. Deploy

```bash
git checkout v1.0.0
phala deploy \
  --name sealcode \
  --compose deploy/docker-compose.yml \
  --instance-type tdx.medium \
  --kms phala \
  --public-sysinfo --public-tcbinfo \
  -e /secure/location/sealcode.env
```

The CLI encrypts each variable to the CVM's public key before upload, so Phala never sees the
plaintext. `--public-tcbinfo` lets anyone fetch the measurements. Record the **App ID** it prints.

Then add Phala Trust Center listing (`--listed`) once the first deploy is verified.

## 4. DNS and TLS

`dstack-ingress` creates the DNS records it needs and requests Let's Encrypt certificates by
DNS-01, with private keys generated inside the TEE. It also sets CAA records so that only its
ACME account can issue for `sealcode.dev`. Check:

```bash
curl -sI https://api.sealcode.dev/healthz
curl -s https://sealcode.dev/evidences/ | head
```

## 5. After the first deploy

Verify the deployment the way a customer would:

```bash
npx tsx scripts/verify-attestation.ts --site https://sealcode.dev --ref v1.0.0
```

Then create the first staff account. Sign in once at `https://sealcode.dev/login` so the user
exists, then run the grant against the production database over the CVM's SSH tunnel:

```bash
DATABASE_URL=postgres://sealcode:…@localhost:5432/sealcode \
  pnpm --filter @sealcode/db staff:grant you@sealcode.dev
```

Staff access is never exposed in the UI.

## Updating

Repeat steps 1 and 3 with `phala deploy --cvm-id <app-id>`. The compose hash changes on every
release; the trust center shows the new one, and customers can verify it against the new tag.
The `migrate` service applies database migrations before the gateway and web start.

Rolling back means deploying the previous release tag. Migrations are additive; never deploy a
release whose migrations drop columns an older release still reads.

## Security notes

- `NODE_ENV=production` is set in the compose file, not the environment, because it switches the
  gateway's upstream to the compiled-in Phala URL. The upstream can't be redirected by any
  variable.
- The web app mounts the dstack socket read-only, for attestation. The gateway doesn't mount it.
- Postgres isn't exposed outside the compose network.
- Backups are encrypted before they touch disk.

## Monitoring

See [runbooks/monitoring.md](./runbooks/monitoring.md) for health checks, the public status page
and alerting, and [runbooks/incident.md](./runbooks/incident.md) for incident response.
