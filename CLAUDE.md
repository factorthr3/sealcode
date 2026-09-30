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
