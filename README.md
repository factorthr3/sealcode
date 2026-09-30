# Sealcode

**Confidential AI coding, with receipts.** A hosted gateway that lets regulated engineering teams
use Claude Code, OpenCode, Cline and Continue with strong open models running inside hardware
enclaves (TEEs) on Phala. It adds seats, keys, budgets and a metadata-only audit log, and every
response carries a receipt the customer can verify.

```
Claude Code ──TLS──▶ Sealcode gateway (Phala CVM, Intel TDX) ──▶ Phala attested gateway ──▶ GLM 5.3 in a GPU TEE
                     └── web: marketing site, dashboard, trust center · Postgres (metadata only)
```

- **Gateway** (`apps/gateway`): Anthropic Messages and OpenAI chat completions, streaming
  passthrough, key auth, rate limits, budgets, metering and receipts. About 1,200 lines, so it can
  be audited.
- **Web** (`apps/web`): landing page with a live playground, pricing, security, trust center,
  docs, dashboard (keys, members, usage, budgets, audit log, billing) and staff console.
- **CLI** (`packages/cli`, npm `sealcode`): `npx sealcode login | doctor | logout`.
- **Shared** (`packages/shared`): model aliases, plans, pricing, limits, error shapes and the
  allowlist-only logger. The single source of truth for all of the above.
- **DB** (`packages/db`): Drizzle schema, migrations and tenant-scoped data access.

Read [docs/BRIEF.md](docs/BRIEF.md) for the product brief and [docs/DECISIONS.md](docs/DECISIONS.md)
for where the build departs from it. In particular, billing is contact-us for now, not Stripe.

## Local setup

Requirements: Node 22+, pnpm (`corepack enable pnpm`) and Postgres 16 or 17.

```bash
pnpm install
cp .env.example .env
createdb sealcode && createdb sealcode_test
pnpm db:migrate
pnpm db:seed                                 # a staff user and a demo org; prints one API key
pnpm --filter @sealcode/gateway dev:mock     # stand-in for Phala on :8788 (not a TEE)
pnpm --filter @sealcode/gateway dev          # gateway on :8787
pnpm --filter @sealcode/web dev              # site and dashboard on :3000
```

Sign in at <http://localhost:3000/login> as `dev@sealcode.test`. Without `RESEND_API_KEY` the
sign-in link appears on the check-email page. To use real models, set `PHALA_API_KEY` and remove
`UPSTREAM_BASE_URL`.

Connect a local Claude Code:

```bash
node packages/cli/build.mjs
node packages/cli/dist/cli.js login --site http://localhost:3000
```

## Tests and checks

| Task                                          | Command                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| Everything (mock upstream, no live keys)      | `pnpm test`                                                                     |
| Lint, types, format                           | `pnpm lint`, `pnpm typecheck`, `pnpm format`                                    |
| Gateway added latency (50 concurrent streams) | `pnpm bench`                                                                    |
| Phase 0 compatibility checks against Phala    | `PHALA_API_KEY=… pnpm spike`                                                    |
| Claude Code end to end                        | `scripts/spike/claude-code-e2e.sh phala` or `gateway`                           |
| Soak test                                     | `SOAK_KEY=… SOAK_MINUTES=1440 pnpm soak`                                        |
| Backup restore drill                          | `pnpm backup:drill`                                                             |
| Verify a deployment's attestation             | `npx tsx scripts/verify-attestation.ts --site https://sealcode.dev --ref <tag>` |

## Deploying

See [deploy/README.md](deploy/README.md) for the release process, sealed secrets, `phala deploy`,
DNS and TLS inside the CVM, and updates. The runbooks cover [incidents](deploy/runbooks/incident.md),
[backups](deploy/runbooks/backup-restore.md) and [monitoring](deploy/runbooks/monitoring.md).

## Documentation

- Customer docs: [docs/customer](docs/customer), published at `/docs`.
- [Phase 0 spike report](docs/spike-report.md): what is verified and what needs a live Phala key.
- [Threat model](docs/threat-model.md).
- [DPA template placeholder](docs/legal/dpa-template.md).

Claude and Claude Code are trademarks of Anthropic, PBC. Sealcode is not affiliated with or
endorsed by Anthropic.
