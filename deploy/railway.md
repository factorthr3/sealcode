# Interim deployment on Railway

Until Sealcode moves into its Phala Confidential VM ([README.md](./README.md)), it runs on Railway
at `sealcode.ai`. This is **not** a TEE deployment: the gateway handles prompts on standard cloud
hosting. Model inference is still TEE-only, through Phala. Because no dstack socket is present,
the site's copy says so automatically (`apps/web/src/lib/hosting.ts`), and the trust center shows
no hardware quote.

## Services

Railway project `sealcode`, environment `production`, region EU West (Amsterdam). Each app service
deploys from `main` of `factorthr3/sealcode`.

| Service    | Source                      | Domain            | Port | Notes                                                                      |
| ---------- | --------------------------- | ----------------- | ---- | -------------------------------------------------------------------------- |
| `web`      | `deploy/web.Dockerfile`     | `sealcode.ai`     | 3000 | Pre-deploy runs migrations (`node tools/migrate.js`); health `/api/health` |
| `gateway`  | `deploy/gateway.Dockerfile` | `api.sealcode.ai` | 8787 | Health `/healthz`                                                          |
| `Postgres` | Railway Postgres template   | private only      |      | Daily backups are Railway's; see below                                     |

## Variables

Both app services: `NODE_ENV=production`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`, and
`KEY_PEPPER` and `PLAYGROUND_TOKEN_SECRET` as shared variables (they must match in both).

- **web:** `PORT=3000`, `PUBLIC_SITE_URL=https://sealcode.ai`,
  `PUBLIC_GATEWAY_URL=https://api.sealcode.ai`, `SOURCE_COMMIT=${{RAILWAY_GIT_COMMIT_SHA}}`,
  `EMAIL_FROM`, `SALES_INBOX`, `TOTP_ENCRYPTION_KEY` (32 random bytes, base64), `PHALA_API_KEY`
  (for receipt lookups) and `RESEND_API_KEY`.
- **gateway:** `GATEWAY_PORT=8787`, `PORT=8787`, `PUBLIC_SITE_URL=https://sealcode.ai`,
  `PLAYGROUND_ORIGIN=https://sealcode.ai`, `LOG_LEVEL=info` and `PHALA_API_KEY`.

Secrets were generated locally (`openssl rand`) and piped straight into `railway variables`, so they
don't appear in logs or in this repo. Rotating `KEY_PEPPER` invalidates every API key, and
rotating `TOTP_ENCRYPTION_KEY` breaks every enrolled authenticator.

**Added by hand in the Railway dashboard:**

- **`PHALA_API_KEY` (web and gateway).** The gateway refuses to start in production without it.
- **`RESEND_API_KEY` (web).** Until it is set, sign-in links and invitations can't be sent, so
  nobody can sign in. Contact-form enquiries are still saved to `sales_enquiries`; read them in
  Railway's Postgres data view. Verify `sealcode.ai` as a sending domain in Resend first.

## DNS

Point the domains at Railway with the records it shows for each custom domain:

- **Apex `sealcode.ai`:** a CNAME, which needs a DNS host that flattens CNAMEs at the apex (such as
  Cloudflare) or supports ALIAS/ANAME records.
- **`api.sealcode.ai`:** a CNAME.
- **Verification:** the `_railway-verify` TXT records.

If you use Cloudflare, keep proxying off (grey cloud) so Railway can issue the certificates.

## First staff account

After email works, sign in once at `https://sealcode.ai/login`, then from a machine with the
production `DATABASE_URL` (Railway → Postgres → Connect):

```bash
DATABASE_URL=… pnpm --filter @sealcode/db staff:grant you@example.com
```

## Moving to Phala

Follow [README.md](./README.md). Once DNS points at the CVM, the site's TEE claims and the live
attestation appear on their own. Then delete this Railway project. Dump the database first
(`pg_dump`) if there is data to keep.
