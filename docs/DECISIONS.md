# Decisions and deviations from the brief

Where the build departs from [BRIEF.md](./BRIEF.md), and why. Newest decisions are at the bottom of
each section.

## Commercial

### Contact-us billing instead of Stripe (30 Sept 2026, @Chris)

Billing does not go through Stripe for now. Milestone 4 changes as follows:

- **Activation by contact.** The pricing page, the dashboard's Billing page and the gateway's
  pilot-ended errors all point to `/contact`. The enquiry is stored and emailed to sales.
- **Staff console.** Sealcode staff manage organisations at `/staff`. Each agreement is written to
  `subscriptions` as the record of the commercial terms. Staff are users with `is_staff`, granted
  only by the `staff:grant` script, and must use two-factor login.
- **Invoicing is manual.** The dashboard shows a live monthly statement (seat fees, pooled
  allowance, overage) computed by `monthlyStatement()` from `usage_events`. Staff export the same
  statement as CSV to invoice from. The overage formula is documented in `pricing.ts` and
  reproduces from `usage_events` alone, which keeps the "matches to the cent" criterion testable
  without Stripe.
- Stripe can be added later behind the same plan config. Nothing in the schema assumes manual
  billing beyond `subscriptions.source = 'manual'`.

### Sales-led: no free trial (1 Oct 2026, @Chris)

- **No self-serve trial or sign-up.** `/signup` redirects to the contact form, and signed-in users
  can't create organisations. The CTAs read "Contact sales" or "Get Team" and the like, all going
  to `/contact`.
- **Staff create customer organisations** from the staff console once terms are agreed, on a paid
  plan or as a time-limited **pilot**. Either way the customer's first owner gets an email
  invitation. Pilots are the brief's design-partner pilots. Internally they still use the `trial`
  plan and status, with the `TRIAL` terms in `plans.ts` (6 seats, 20M tokens) and a length set by
  staff. The UI calls them pilots.
- **One allowance per pilot.** A pilot's token allowance covers its whole length; it doesn't reset
  on the 1st of the month. Pilot budget alerts fire once per pilot. Paid plans keep monthly budgets.
- **Prices.** Team ($59) and Business ($99) per-seat prices, token allowances and overage rates are
  published (`SHOW_PUBLIC_PRICES = true`). **Enterprise has no list price**: it is agreed with each
  customer (`platformFeeMonthly: null`). For Enterprise orgs, the billing page and statement CSV
  show usage and say charges are per the agreement, instead of computing a figure.
- The self-serve trial and its abuse controls (work email only, one trial per company domain) were
  built and then removed in favour of this model.

### Try before you buy (30 Sept 2026, @Chris)

- **Live playground on the landing page.** Anonymous visitors can send coding prompts to
  `sealcode-pro` or `sealcode-fast` and see the Phala receipt for each response. The web app issues
  a short-lived signed playground token (`sc_demo_…`, 15 minutes, 12 requests). **The browser then
  calls the gateway directly**, so the web app never sees prompt content, as the brief requires.
  The gateway caps output tokens, request size, per-token rate and a global daily token budget
  (`PLAYGROUND` in `plans.ts`). Tools are refused on playground tokens. With no free trial, this is
  the only way to try Sealcode without talking to us. At current Phala prices the daily cap costs
  at most about $9–13 a day.

## Technical

- **Phase 0 ran without live access.** No Phala key was available, so the live checks are automated
  but not run. See [spike-report.md](./spike-report.md). The build proceeds against the mock
  upstream on a conditional go.
- **CLI sets `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`** as well as the variables in the brief.
  Claude Code sends beta fields such as `context_management` to unrecognised model IDs, and doesn't
  retry when the upstream rejects them. Drop the setting if the live spike shows Phala accepts
  them. It's controlled by `CLAUDE_CODE_ENV` in `packages/shared/src/claude-code.ts`.
- **Receipt verification is proxied.** Phala's receipts endpoint needs Sealcode's Phala key, so the
  dashboard fetches receipts server-side, and only for receipt IDs that belong to the signed-in
  org's own `usage_events`. Receipts contain hashes and routing metadata, never content.
- **No `phala.toml`.** The Phala CLI documents no such file. The deploy uses
  `phala deploy -c deploy/docker-compose.yml -e <env file>`, recorded in `deploy/README.md`.
- **TLS in the CVM with `dstack-ingress`**, pinned by digest, routing `api.` to the gateway and the
  apex to the web app.
- **Postgres versions.** Production pins the `postgres:16` image by digest. Local development uses
  Homebrew Postgres 17, which is schema-compatible.
- **TypeScript 6.0.** `typescript-eslint` doesn't support TypeScript 7 yet.
- **No dstack SDK in the image.** `@phala/dstack-sdk` pulls in crypto peer dependencies we don't
  use, so the web app calls the guest agent's `/Info` and `/GetQuote` itself
  (`apps/web/src/lib/dstack.ts`).
- **Customer docs are Markdown in `docs/customer`**, rendered at build time with `marked` (no
  runtime dependency on the files). Plan-derived numbers are `{{placeholders}}` filled from config.
- **Per-key rate limits raised** to trial 120, Team 240, Business 480 and Enterprise 1,000
  requests per minute. A real Claude Code session with sub-agents hit the original 60 rpm trial
  limit within a minute.
- **Marketing claims** follow the brief's say/don't-say table. The site makes no certification
  claims, avoids naming competitors (their prices are unverified), and marks the terms and privacy
  pages as drafts pending legal review.

- **Backups** are encrypted with a sealed `BACKUP_ENCRYPTION_KEY` that only the CVM reads at
  runtime, plus one offline escrow copy split between two people for disaster recovery. A
  KMS-derived key that exists only inside the TEE would lose the backups if the app were lost.
  Off-site copies go to any S3-compatible bucket, which is not yet chosen.
- **Not chosen yet (third-party services, needs sign-off):** the uptime monitor and status-page
  provider, and the off-site backup bucket. Both are documented in `deploy/runbooks`.

## New kinds of stored data

Nothing below contains prompt or completion content.

| Table                                                | Why                                         | Contents                                                                                              |
| ---------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `sales_enquiries`                                    | Contact-us billing                          | Name, work email, company, team size, plan interest, free-text message typed into the contact form    |
| `admin_events`                                       | Audit of admin actions for regulated buyers | Actor, action (key issued or revoked, member invited, budget changed, org activated), target ID, time |
| `sessions`, `magic_links`, `device_codes`, `invites` | Sign-in, CLI login and invitations          | Hashed tokens, expiry, user and org IDs                                                               |
| `notifications`                                      | Outbox for budget alerts and invites        | Kind, recipient, metadata such as the threshold crossed                                               |

## Workflow

- One branch and pull request per milestone. Each is merged once lint, typecheck and tests pass.
