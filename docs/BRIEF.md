# Sealcode: Build Brief for a Confidential AI Coding Gateway

30 Sept 2026 · @Chris

> **Amendments (30 Sept 2026, @Chris):** billing does **not** go through Stripe for now. Customers
> contact Sealcode for billing and activation. The marketing site must let prospects **try the
> product before buying** (a live playground plus a self-serve trial). See
> [DECISIONS.md](./DECISIONS.md) for how the brief was adapted.

## Summary

Build Sealcode: a hosted gateway that lets regulated engineering teams use Claude Code and other AI
coding clients with open models running inside hardware enclaves (TEEs) on Phala. It adds per-seat
billing, usage limits and an audit trail. The whole service runs in a Phala Confidential VM, and
every response carries a receipt the customer can verify.

What Claude Code is being asked to build for v1:

- **Gateway API**: Anthropic Messages-compatible `/v1/messages` and OpenAI-compatible
  `/v1/chat/completions` endpoints. They authenticate customer keys, enforce limits, meter tokens
  and forward requests to Phala's attested inference gateway.
- **Admin dashboard**: orgs, seats, API keys, usage, spend caps and the audit log.
- **Onboarding CLI**: one command that configures Claude Code for a developer.
- **Billing**: Stripe per-seat subscriptions with a pooled token allowance and metered overage.
  *(Amended: contact-us billing and manual activation for now.)*
- **Trust center**: a public page proving which code the gateway runs.
- **Marketing site**: landing page, pricing, security page and customer docs.

**Definition of done.** A new customer can sign up, pay and invite 5 developers. Each developer runs
one command and is coding in Claude Code against GLM 5.3 within 10 minutes. No prompt or completion
content is ever written to disk or logs. The gateway's attestation verifies against the published
source commit.

"Sealcode" is a working name. Check trademark and domain availability before launch.

## Problem, customer and positioning

Regulated teams want AI coding agents, but their policies block sending source code to standard AI
APIs. Today they either self-host models on their own GPUs, which is expensive and slow to operate,
or go without. Sealcode sells the middle path: strong open models delivered as a normal API, running
inside hardware enclaves, with proof attached to every request.

The v1 target customers are UK and EU teams with 20 to 500 engineers:

| Segment | Why they buy | Typical buyer |
| --- | --- | --- |
| Fintech and payments | FCA outsourcing rules, client confidentiality, GDPR | CTO, Head of Platform, CISO |
| Legal tech and law-firm innovation teams | Privileged client data in code and test fixtures | Head of Innovation, CTO |
| Health tech and NHS suppliers | Patient data in fixtures, NHS DSPT obligations | CTO, Data Protection Officer |
| Government and defence contractors | Contractual data-handling clauses | Engineering Director |

**Positioning statement.** For engineering teams in regulated industries who can't send source code
to standard AI APIs, Sealcode is a confidential AI coding gateway that works with the tools
developers already use. Unlike self-hosted models, it needs no GPUs or ML operations. Unlike
mainstream AI coding tools, every request runs in hardware-isolated enclaves and comes with a
verifiable receipt.

The main alternatives are mainstream AI coding tools with policy-based privacy (GitHub Copilot
Business, Cursor) and self-hosted models. Verify competitor prices and features before publishing
any comparison page.

## Product scope (v1)

v1 is a gateway, a dashboard and a CLI that sit behind the coding tools developers already use.
Claude Code is the flagship client. Any OpenAI-compatible client, such as OpenCode, Cline or
Continue, works through `/v1/chat/completions`.

Customers see model aliases, never raw vendor IDs, so upstream models can be swapped without
customer changes. Claude Code's opus and sonnet tiers map to `sealcode-pro`, and its haiku tier maps
to `sealcode-fast`.

| Alias | Default upstream model | Role | Upstream price, input / output (USD per 1M tokens) |
| --- | --- | --- | --- |
| `sealcode-pro` | `z-ai/glm-5.3` | Main coding model, 1M context | $1.40 / $4.40 |
| `sealcode-fast` | `z-ai/glm-5.3-flash` | Background tasks and quick edits | $0.15 / $0.50 |

Prices come from Phala's live model catalog and model page.

In scope:

- Orgs, seats and roles: Owner, Admin, Developer, Billing.
- API keys: one per developer per device, scoped to an org, revocable and shown once.
- Limits: a per-key rate limit in requests per minute, plus monthly token budgets per seat and per
  org. Each org chooses a hard stop or a soft alert.
- Usage metering: input, output and cached tokens for every request, by key and model, with daily
  rollups.
- Audit log of request metadata only: time, key, model, token counts, latency, status and the
  upstream Phala receipt ID.
- Onboarding CLI, dashboard, Stripe billing, trust center and marketing site.

Out of scope for v1:

- Our own IDE plugin or chat UI.
- On-premises installs.
- Running our own GPUs or fine-tuning models. These are Enterprise roadmap items.
- SSO and SCIM, which ship with the Business tier after launch.
- Storing prompts or completions, content analytics or conversation history. This is permanently
  out of scope because it is the product's core promise.

## Architecture and trust boundary

Everything that touches customer code runs inside TEEs: our gateway in a Phala Confidential VM
(CVM), then Phala's attested inference gateway, then the model's enclave. The developer's laptop is
the only place code exists outside an enclave.

Request path:

1. Claude Code on the developer's machine sends `POST /v1/messages` to `https://api.sealcode.dev`.
   TLS terminates inside our CVM, not at a proxy in front of it.
2. The gateway authenticates the key from `Authorization: Bearer` or `x-api-key` and resolves the
   org, seat and limits.
3. It checks the rate limit and budget. If either is exceeded, it returns an Anthropic-format 429
   error.
4. It rewrites the model alias to the upstream ID and adds
   `"provider": {"aci_verified": true, "zdr": true}`, so the request can only reach an upstream
   verified inside a TEE with zero data retention.
5. It forwards the request to `https://inference.phala.com/v1/messages` using Sealcode's Phala key.
6. It streams the server-sent events back to the client unchanged, apart from rewriting the model
   name if needed.
7. When the stream ends, it records token usage and the `x-receipt-id` header to Postgres. It stores
   metadata only, never content.

Components:

| Component | Technology | Runs in | Notes |
| --- | --- | --- | --- |
| gateway | TypeScript, Hono on Node.js 22 | Phala CVM | Stateless streaming proxy. Target added latency under 20 ms at p50 |
| web | Next.js (current stable), Tailwind | Phala CVM | Dashboard, marketing site and trust center. Never sees prompt content |
| db | Postgres 16 | Phala CVM, persistent volume | Orgs, hashed keys, usage and audit metadata |
| cli | Node.js, published to npm as `sealcode` | Developer machine | Writes Claude Code settings |
| Billing | Stripe Billing and webhooks | Stripe | Seat quantity plus metered usage *(amended: deferred)* |
| Email | Postmark or Resend | Third party | Transactional email only: invites, alerts, receipts |

Use one language across all services. Keep the gateway small (target under 3,000 lines) because
customers will audit it. Use Postgres only, with no Redis, to keep the enclave's attack surface
small. v1 runs a single gateway replica with an in-memory token bucket for rate limits and Postgres
for budgets.

Repo layout (pnpm workspaces):

```
sealcode/
  apps/gateway/     # /v1/messages, /v1/chat/completions, /v1/models
  apps/web/         # dashboard, marketing site, trust center
  packages/db/      # Drizzle schema and migrations
  packages/shared/  # types, error shapes, plans, pricing, model aliases
  packages/cli/     # npx sealcode login | doctor | logout
  deploy/           # docker-compose.yml for the Phala CVM, phala.toml
  docs/             # customer docs, spike report, threat model
```

Core tables: `orgs`, `users`, `memberships` (with role), `api_keys` (hash, prefix, last 4
characters, creator, revoked time), `usage_events` (request ID, key, model alias, upstream model,
input, output and cached tokens, latency, status, receipt ID, time), `budgets` and `subscriptions`.

**Deployment.** Deploy one CVM running `deploy/docker-compose.yml` with the Phala CLI
(`phala deploy`). Store every secret as a Phala sealed environment variable, which is readable only
inside the TEE. Use Phala's TLS passthrough and TEE-controlled domain certificates so TLS terminates
inside the CVM. Confirm how this works in the Phase 0 spike.

## Phase 0: compatibility spike (2 days, before any product code)

The whole product depends on Claude Code working through Phala's Messages endpoint, so prove that
first. Phala's Messages reference documents `model`, `max_tokens`, `messages`, `system`,
`temperature`, `stream` and `provider`, but does not document `tools`. Claude Code cannot read or
edit files without tool use.

- [ ] **Tool use.** Send a request with a `tools` array, streaming and non-streaming. Confirm
  `tool_use` content blocks, `input_json_delta` events and `stop_reason: "tool_use"`.
- [ ] **Stream shape.** Confirm the events match Anthropic's format: `message_start`,
  `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta` with usage,
  and `message_stop`.
- [ ] **Usage and caching.** Confirm input, output and cache-read token counts are returned. Test
  whether `cache_control` lowers cost; GLM 5.3 lists cache reads at $0.26 per 1M tokens against
  $1.40 uncached, so this roughly doubles margin.
- [ ] **Receipts.** Confirm `x-receipt-id` is present on streamed responses, and that the receipt
  shows `upstream.verified` with `result: verified` and `required: true`.
- [ ] **Routing constraints.** Confirm `provider: {"aci_verified": true, "zdr": true}` is accepted
  for both models. Record any model with no zero-retention route.
- [ ] **Claude Code end to end.** Point Claude Code straight at Phala with
  `ANTHROPIC_BASE_URL=https://inference.phala.com` and `ANTHROPIC_AUTH_TOKEN`, with
  `ANTHROPIC_API_KEY` unset. Run a 20-step task: read files, edit them, run tests. Log every 400
  error and whether `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` fixes it.
- [ ] **Claude Code's gateway protocol.** Read the gateway compatibility guide and the gateway
  connection guide. List the headers to forward, whether `/v1/messages/count_tokens` is needed, the
  model discovery response format, and the error shapes that trigger automatic compaction.
- [ ] **Context limits.** Send an over-length prompt. Confirm Phala returns an Anthropic-shaped
  "prompt is too long" error; Claude Code only compacts and retries automatically when it recognises
  that error.
- [ ] **TLS passthrough.** Confirm a CVM can serve a custom domain with TLS terminating inside the
  enclave and a certificate key generated inside the TEE.
- [ ] **Latency baseline.** Measure time to first token and tokens per second for both models from a
  UK client.

Output: `docs/spike-report.md` with pass or fail per item and a go or no-go recommendation.

Fallback if tool use fails through `/v1/messages`: the gateway translates between Anthropic Messages
and OpenAI chat completions itself, because Phala's chat completions endpoint documents tool
calling. This adds about 1 week to Milestone 1.

## Build milestones and acceptance criteria

The build takes about 7 weeks after the spike. Finish each milestone's acceptance criteria before
starting the next.

1. **Gateway core (1 week).** Build `POST /v1/messages` with streaming passthrough,
   `POST /v1/chat/completions` and `GET /v1/models` listing the aliases in the format the spike
   found. Include key auth through both `Authorization: Bearer` and `x-api-key`, alias mapping from
   `packages/shared`, usage and receipt capture, and Anthropic-format errors for 401, 403, 429 and
   5xx. Pass upstream errors through unchanged.
   - Claude Code pointed at `http://localhost:8787` completes the spike's 20-step task.
   - Contract tests using recorded fixtures pass in CI against a mock upstream, with no live key.
   - Added latency is under 20 ms at p50 and under 100 ms at p99, with 50 concurrent streams.
   - A log-scan test runs the full suite and finds zero occurrences of fixture prompt text in any
     output.
2. **Accounts, keys and limits (1 week).** Build the Postgres schema and migrations. Keys use the
   format `sc_live_` plus 32 random bytes in base62, stored as a SHA-256 hash with a server-side
   pepper. Add rate limits, monthly budgets, and alert emails at 50%, 80% and 100% of budget.
   - A revoked key stops working within 5 seconds.
   - In hard-stop mode, an exceeded budget returns a 429 that Claude Code displays as a readable
     message.
   - Tests prove no query can read another org's data.
3. **Dashboard and CLI (1.5 weeks).** The dashboard covers sign-up by email magic link, mandatory
   two-factor login for Owners and Admins, org creation, invites, key issue and revoke, usage charts
   by seat, day and model, budget settings, and the audit log with CSV export. Add a "Connect Claude
   Code" page with a copy-paste settings snippet. The CLI provides `npx sealcode login`, which uses a
   device-code flow, creates a key, and merges settings into `~/.claude/settings.json` without
   overwriting other entries, backing up the original first. It sets `ANTHROPIC_BASE_URL`,
   `ANTHROPIC_AUTH_TOKEN`, the three `ANTHROPIC_DEFAULT_*_MODEL` variables and
   `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. `sealcode doctor` flags a conflicting
   `ANTHROPIC_API_KEY` and tests connectivity. `sealcode logout` restores the backup.
   - A fresh laptop reaches a working Claude Code session in under 3 minutes.
   - The CLI works on macOS, Linux and Windows PowerShell.
4. **Billing (4 days).** Build Stripe Checkout for per-seat plans, with seat changes synced and
   prorated, a pooled monthly token allowance, overage reported to Stripe daily, invoices shown in
   the dashboard, and Stripe Tax for UK VAT. *(Amended: replaced by trial + contact-us activation;
   see DECISIONS.md.)*
   - In Stripe test mode, an org subscribes, adds a seat and exceeds its allowance. The invoice
     matches `usage_events` to the cent.
5. **Trust center and audit (4 days).** Build a public `/trust` page showing the live CVM
   attestation and compose hash, linking to the exact git tag and `docker-compose.yml`, with
   verification steps and a `scripts/verify-attestation.ts` customers can run. Each audit-log row
   links to its Phala receipt, and a Verify button shows the `upstream.verified` result. Add a
   subprocessor list and a DPA template placeholder.
   - Someone outside the team can follow `/trust` and confirm the compose hash matches the public
     repo tag.
6. **Marketing site and docs (4 days).** Build the pages in the marketing section below. The pricing
   page reads from the same plan config as billing.
   - Lighthouse scores are 95 or higher for performance and accessibility.
   - Quickstarts exist for Claude Code, OpenCode, Cline and Continue.
7. **Hardening and launch (1 week).** Write a threat model, run a dependency audit and rate-limit
   abuse tests, and set up encrypted Postgres backups whose key is held inside the TEE. Add uptime
   monitoring with a public status page and an incident runbook. Deploy to the Phala CVM on the
   production domain.
   - A backup restore drill succeeds.
   - A 24-hour soak test at 20 concurrent sessions drops zero streams.

## Security and privacy requirements

These requirements are the product. Claude Code must not relax any of them without explicit
approval.

- **No content persistence.** Request and response bodies are never logged, stored, cached to disk
  or sent to any third party, including error trackers. Log through a shared logger that only
  accepts allowlisted fields. Do not use a third-party error tracker in v1.
- **Enclave-only upstream.** Every upstream call sets `aci_verified: true`, and sets `zdr: true`
  wherever a zero-retention route exists. A request never falls back to a non-TEE route, and a test
  proves it.
- **Secrets.** The Phala key, Stripe keys, database password and key pepper are Phala sealed
  environment variables only. They never appear in the repo, images or logs.
- **TLS inside the enclave.** Customer traffic is decrypted only inside the CVM.
- **Reproducible builds.** Pin base images by digest, commit lockfiles and publish the compose file,
  so the attestation hash is meaningful to customers.
- **Key handling.** Keys are hashed and use a distinct `sc_live_` prefix so secret scanners can
  detect leaked keys. Show each key once.
- **Admin access.** Two-factor login is mandatory for Owners and Admins.
- **Tenant isolation.** Every query is scoped by `org_id`, with tests for cross-tenant access.

**Honest trust boundary.** Publish this on `/security`. Customer code is plaintext inside two
enclaves: our gateway and the model's runtime. The hardware stops the cloud host, Phala staff and
our operators from reading enclave memory. Our gateway code does handle the plaintext, which is why
its source is public and its attestation verifiable: a malicious deploy would change the hash. The
developer's machine and the Claude Code client sit outside our boundary. Claude Code sends some
non-essential traffic to Anthropic unless `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` is set, which
the CLI sets. Its WebFetch domain check still calls `api.anthropic.com`, so document the
`skipWebFetchPreflight` setting for customers with strict egress rules.

## Pricing, packaging and unit economics

Launch pricing is a per-seat plan with a pooled token allowance, priced at a premium to mainstream
coding tools because privacy is the product. All figures are USD starting hypotheses. Store them in
`packages/shared` config so they can change without code changes.

| Plan | Price per seat per month | Minimum seats | Included tokens per seat (pooled across the org) | Adds |
| --- | --- | --- | --- | --- |
| Team | $59 monthly, $49 annual | 3 | 20M | Gateway, dashboard, audit log, trust center, email support |
| Business | $99 monthly, $79 annual | 10 | 40M | SSO and SCIM, audit export API, per-team budgets, DPA, priority support |
| Enterprise | From $2,500 per month platform fee, plus seats | 50 | Custom | Dedicated CVM, custom domain, dedicated GPU TEE model option, SLA, security review support |

Overage is $2.50 per 1M input tokens, $0.50 per 1M cached input tokens and $8.00 per 1M output
tokens, about 45% margin over upstream cost.

**Cost basis.** Coding agents resend large contexts, so assume 95% of tokens are input and 5%
output. At GLM 5.3 prices that blends to $1.55 per 1M tokens with no caching. If the spike confirms
caching and 70% of input tokens are cache reads, it drops to $0.79 per 1M.

Gross margin per seat at full allowance use, monthly pricing, before payment fees and hosting:

| Plan | Seat price | Model cost, no caching | Margin, no caching | Model cost, 70% cached | Margin, 70% cached |
| --- | --- | --- | --- | --- | --- |
| Team | $59 | $31.00 | $28.00 (47%) | $15.84 | $43.16 (73%) |
| Business | $99 | $62.00 | $37.00 (37%) | $31.68 | $67.32 (68%) |

Most seats won't use their full allowance, so real margins should be higher. Annual pricing is the
risk: without caching, full-use margin falls to 37% on Team and 22% on Business. Only offer annual
discounts once caching is confirmed. As a scale reference, 20 customers with 10 seats each on Team
monthly is $11,800 in monthly recurring revenue.

## Marketing site, messaging and launch

The tagline is **"Confidential AI coding, with receipts."** It names the category and the proof that
separates Sealcode from policy-based privacy.

Hero headline options to test:

1. AI coding for teams that can't send code to the cloud.
2. Your code stays sealed. Your developers stay fast.
3. Bring AI coding agents to your regulated codebase.

The four messaging pillars:

- **Sealed.** Every request is processed inside hardware enclaves.
- **Proven.** Published attestation for our code, and a verifiable receipt for every request.
- **Familiar.** Works with Claude Code, OpenCode, Cline and Continue, set up with one command.
- **Controlled.** Seats, budgets and a full audit log, with no prompt content stored.

Pages: Home (hero, how-it-works diagram, proof strip, pricing teaser, FAQ), `/security` (trust
boundary: what we can and can't see), `/trust` (live attestation), `/pricing`, `/docs` (quickstarts,
admin guide, API reference), `/compliance` (subprocessors, DPA, SOC 2 roadmap) and legal pages.

Copy must stay accurate, because this audience reads it closely:

| Say | Don't say |
| --- | --- |
| "Your code is processed inside hardware-isolated enclaves, and we publish proof of the exact code that handles it." | "No one can ever see your code." |
| "We never store prompts or completions." | "Zero risk" or "unhackable" |
| "Works with Claude Code." | Anything implying Anthropic endorsement, or "Claude" in the product name or logo |
| "Built for teams with GDPR and FCA obligations." | "GDPR-compliant", "HIPAA-compliant" or "certified" before an audit |

The footer states that Claude and Claude Code are trademarks of Anthropic, and that Sealcode is not
affiliated with or endorsed by Anthropic.

Launch plan for the first 60 days:

1. Sign 5 design partners from the target segments on a free 60-day pilot, in exchange for weekly
   feedback and a case study.
2. Publish a technical post walking through how a customer verifies a request end to end, plus a
   cost comparison against self-hosting on GPUs.
3. Apply to Phala's startup program and its Trust Center featured-builder listing for credits and
   co-marketing.
4. Run direct outreach to CTOs and CISOs at UK fintech, legal tech and health tech companies, then a
   Show HN post once 2 case studies are live.

Track these metrics weekly: activation (first successful request within 24 hours of an invite),
weekly active seats, tokens per seat, gross margin per org and pilot-to-paid conversion.

## Risks, legal checks and open questions

The biggest risk is technical compatibility, which the spike settles in 2 days. The rest are
commercial and legal, and each needs an owner before launch.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Phala's Messages endpoint doesn't fully support Claude Code's tool use | Blocks the build | Phase 0 spike first. Fallback: the gateway translates to OpenAI chat completions |
| A Claude Code update adds fields the upstream rejects | Customer-facing outage | Nightly CI against the latest Claude Code release. Document a tested version. Keep the `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` fallback ready |
| Open models fall short of Claude on complex tasks | Churn | Position on privacy, not raw capability. Offer model choice, such as Kimi K3 or Qwen, and measure task success |
| Upstream price change or model retirement | Margin loss | Model aliases, config-driven pricing, and a 30-day price-change clause in the terms |
| Single upstream provider | Outage with no fallback | Public status page and an SLA carve-out. Add a second TEE provider on the roadmap |
| Security incident in the gateway | Existential for a privacy product | Minimal code, published attestation, external penetration test before general availability |

Legal checks before charging anyone:

- [ ] Review Claude Code's licence and Anthropic's terms for commercial use with third-party model
  backends. Customers install Claude Code themselves; confirm the product's reliance on it is
  permitted.
- [ ] Review Phala's terms for reselling Confidential AI API access, and each model's licence for
  commercial resale.
- [ ] Run trademark searches for "Sealcode" at the UK IPO, EUIPO and USPTO, and secure the domain.
- [ ] Draft terms of service, privacy policy, DPA and a subprocessor list covering Phala, its
  model-serving providers, Stripe and the email provider.
- [ ] Set up the UK company, VAT registration and Stripe Tax.
- [ ] Make no HIPAA claims unless business associate agreements exist all the way down the chain.

Open questions:

- [ ] Which regions host Phala CVMs and the upstream model providers? UK and EU buyers will ask about
  data residency.
- [ ] What does an always-on CVM for the gateway, web app and Postgres cost per month?
- [ ] Does Phala offer volume pricing or a reseller agreement?
- [ ] Does GLM 5.3 prompt caching work through `/v1/messages`? The answer roughly doubles margin.

## Working instructions for Claude Code

Export this doc as Markdown, save it as `docs/BRIEF.md` in a new repo, and start Claude Code with:
"Read docs/BRIEF.md and start Phase 0."

1. Read the whole brief. Run Phase 0 and write `docs/spike-report.md` before writing any product
   code. If any item fails, stop and report with the proposed fallback.
2. Work one milestone at a time, with one commit or PR per milestone. Don't start the next milestone
   until the current one's acceptance criteria pass.
3. Keep a `CLAUDE.md` at the repo root with setup commands, test commands and conventions, and
   update it as you go.
4. Use strict TypeScript, ESLint and Prettier, Vitest for unit and contract tests, Playwright for the
   web app, zod for input validation and Drizzle for the database.
5. Keep plans, prices, limits and model aliases in `packages/shared` config as the single source of
   truth for gateway, billing and pricing page.
6. Use the mock upstream in all default tests. Live Phala calls run only under `pnpm test:live`,
   gated by an environment variable.
7. Never log request or response bodies. Use the shared logger only.
8. Commit `.env.example` only; never commit real keys.
9. Ask before adding any third-party service, storing any new kind of data, or changing anything in
   the security requirements.
10. Finish with a README covering local setup, a deploy runbook in `deploy/`, and the customer docs
    in `docs/`.

## Sources

- Phala Confidential AI models page
- Phala live model catalog — <https://inference.phala.com/v1/models>
- Phala On-demand Confidential AI API — <https://docs.phala.com/phala-cloud/confidential-ai/confidential-model/confidential-ai-api>
- Phala Messages API reference — <https://docs.phala.com/phala-cloud/confidential-ai/confidential-model/api-reference/messages>
- Phala migration and integrations guide — <https://docs.phala.com/phala-cloud/confidential-ai/confidential-model/migration-and-integrations>
- Phala documentation index — <https://docs.phala.com/llms.txt>
- Claude Code: connect to an LLM gateway — <https://code.claude.com/docs/en/llm-gateway-connect>
