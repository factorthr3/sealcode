# Sealcode

Confidential AI coding gateway. Read `docs/BRIEF.md` (the product brief) and `docs/DECISIONS.md`
(where the build deviates from it) before changing anything.

## Setup

- Node 22+ (`.nvmrc`), pnpm via corepack (`corepack enable pnpm`).
- Postgres running locally (Homebrew `postgresql@17` is fine; production uses 16).
- `cp .env.example .env`, then `pnpm install`.

## Commands

| Task                                                    | Command                                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- |
| All unit + contract tests (mock upstream, no live keys) | `pnpm test`                                                                  |
| One project                                             | `pnpm vitest run --project unit` (projects: `unit`, `gateway`, `db`, `live`) |
| Lint / typecheck / format                               | `pnpm lint`, `pnpm typecheck`, `pnpm format`                                 |
| Live Phala checks (needs `PHALA_API_KEY`)               | `pnpm test:live` or `pnpm spike`                                             |
| Phase 0 harness against the mock                        | `SPIKE_TARGET=mock pnpm spike`                                               |

## Conventions

- Strict TypeScript, ESM, `moduleResolution: Bundler`. Workspace packages are consumed as TS source.
- Plans, prices, limits, trial terms, playground limits and model aliases live only in
  `packages/shared/src/{plans,models}.ts`. Never hard-code them elsewhere.
- **Never log request or response bodies.** Services log only through `@sealcode/shared/logger`,
  which drops non-allowlisted fields and redacts free text. Never log `err.message` or stacks; use
  `errorFields(err)`. `no-console` is enforced outside tests and scripts.
- Gateway-generated errors use `anthropicError()` / `openaiError()`; upstream errors pass through
  byte-for-byte.
- Every upstream request sets `provider.aci_verified = true`. Never add a fallback route.
- Every DB query touching tenant data is scoped by `org_id`.
- Default tests use the mock upstream. Anything that calls Phala goes in `*.live.test.ts`.
- Ask before adding a third-party service, storing a new kind of data, or changing a security
  requirement in the brief.

## Gateway (apps/gateway)

- `src/app.ts` is the whole request pipeline: auth → org state → body → alias → limits → upstream
  → relay + meter → one audit row. Keep it small and readable; customers audit it.
- `mock/` is the stand-in for Phala used by tests and local dev. It is not part of the build.
- Local dev without Postgres: `DEV_API_KEY=sc_live_… pnpm --filter @sealcode/gateway dev` with
  `pnpm --filter @sealcode/gateway dev:mock` running.
- `pnpm bench` checks the added-latency target (50 concurrent streams).
- Recorded SSE fixtures live in `apps/gateway/test/fixtures`; refresh them from Phala with
  `SPIKE_RECORD=1 PHALA_API_KEY=… pnpm spike`.

## Database (packages/db)

- Local databases: `createdb sealcode && createdb sealcode_test`. The `db` test project rebuilds
  `sealcode_test` from migrations on every run (`TEST_DATABASE_URL` overrides it).
- Dashboard code reads and writes tenant data only through `forOrg(db, orgId)` in `tenant.ts`.
  Every function there filters by `org_id` in SQL; `test/tenant.test.ts` fails if a new function
  isn't exercised against another org's IDs.
- The gateway imports only `@sealcode/db/gateway-store` (raw SQL, no ORM) and uses its own
  postgres.js client. Drizzle rewires the parsers on a client it wraps, so the store passes dates
  and JSON as strings.
- Tokens (sessions, magic links, invites, device codes) are stored as SHA-256 hashes; API keys as
  HMAC-SHA256 with `KEY_PEPPER`. Plaintext keys exist only in the response that mints them.

## Web (apps/web)

- Next.js 16 (App Router, Turbopack). **Read `apps/web/node_modules/next/dist/docs/` before using
  an API you haven't checked**: request APIs are async, `middleware` is now `proxy.ts`, and
  `forbidden()` is experimental (we redirect instead).
- Local dev reads the root `.env` (see `next.config.ts`). Without `RESEND_API_KEY`, emails are
  printed to the dev server's stdout and the check-email page links to the magic link.
- Auth: magic link (consumed on POST, so link scanners can't burn it) → session cookie →
  TOTP for anyone who is staff or an owner/admin anywhere (`lib/session.ts`). Every server action
  and route handler re-checks the session and permission (`lib/permissions.ts`).
- The web app never sees prompt content. The playground token route signs a token; the browser
  talks to the gateway directly. Receipts are proxied only for the org's own receipt IDs.
- Budget alert emails: `instrumentation.ts` drains the `notifications` outbox every 30 seconds.
- Charts use `--viz-series-*` tokens validated for colour-vision deficiency in both themes; keep a
  legend and a table view with every chart.

## CLI (packages/cli)

- Published to npm as `sealcode`; bundled by esbuild into one dependency-free `dist/cli.js`.
- Touches only the `env` keys in `CLAUDE_CODE_MANAGED_KEYS`; `logout` restores their original
  values and keeps anything else the user changed. Commands take an injectable `Io` for tests.
- Try it locally: `node packages/cli/build.mjs && CLAUDE_CONFIG_DIR=/tmp/cc node packages/cli/dist/cli.js login --site http://localhost:3300`.

## Trust center and attestation

- `apps/web/src/lib/dstack.ts` talks to the dstack guest agent (`/var/run/dstack.sock`, or
  `DSTACK_SIMULATOR_ENDPOINT`) with two calls: `/Info` and `/GetQuote`. No SDK in the enclave.
- `GET /api/attestation?nonce=<hex>` returns the compose hash, app-compose, event log and a TDX
  quote whose report data is `sha256("sealcode-attestation:v1:" + nonce)`.
- `scripts/verify-attestation.ts` is the customer verifier; its checks are pure functions in
  `scripts/attestation/verify.ts` with unit tests. `apps/web/test/attestation.test.ts` runs the
  page code against a fake guest agent.
- The event digest formula (`sha384(type LE ‖ ":" ‖ event ‖ ":" ‖ payload)`) must be confirmed
  against a real CVM on the first deploy (see `docs/spike-report.md`).

## Marketing site

- Pages live in `apps/web/src/app/(marketing)`. The landing page's playground
  (`components/playground.tsx`) loads lazily as it nears the viewport and talks to the gateway
  directly with a playground token.
- Copy must follow the brief's "Say / Don't say" table: no "unhackable", no certifications before
  an audit, nothing implying Anthropic endorsement, and the trademark notice stays in the footer.
- Pricing, trial terms, limits and model names render from `@sealcode/shared`; docs use
  `{{placeholders}}` for plan numbers (`lib/docs.ts`).
- Check Lighthouse against a production build: `pnpm --filter @sealcode/web build`, then
  `pnpm --filter @sealcode/web start:local` (port 3400) and run `npx lighthouse`.
- Every responsive grid needs an explicit `grid-cols-1` base, or wide children (tables, code)
  overflow the page on phones.

## Deploy and operations

- `deploy/docker-compose.yml` is measured into the attestation. Images are pinned by digest; the
  `release` workflow fills in Sealcode's own digests on `v*-rc*` tags. Never deploy an untagged
  compose file.
- Security-relevant settings (`NODE_ENV=production`, domains, origins) go in the compose file, not
  in sealed variables, so they are covered by the compose hash.
- Backups: `deploy/backup/`; drill with `pnpm backup:drill`. Soak: `pnpm soak`.
- Keep `docs/threat-model.md` current when the gateway, compose file or trust boundary changes.
