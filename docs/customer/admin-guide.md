---
title: Admin guide
summary: Members and roles, keys, budgets, the audit log, receipts and billing.
order: 5
---

# Admin guide

## Roles

| Role      | Can                                                                                |
| --------- | ---------------------------------------------------------------------------------- |
| Owner     | Everything, including managing other owners. Two-factor sign-in required.          |
| Admin     | Members, keys, budgets, audit log, usage and billing. Two-factor sign-in required. |
| Developer | Create and revoke their own keys; see their own usage.                             |
| Billing   | Usage and billing. Doesn't take a seat and can't hold keys.                        |

An organisation always keeps at least one owner.

## Members and seats

Invite people from **Members**. Invitations expire after seven days and count against your seats
until they're accepted or withdrawn. Removing a member revokes all of their keys immediately.

## API keys

Each developer should have one key per device. `npx sealcode login` creates one automatically.
Keys look like `sc_live_` followed by 43 characters, so secret scanners can spot leaked ones.
Sealcode stores only a hash of each key, so a lost key can't be shown again: revoke it and create a new
one. Revocation takes effect within five seconds.

## Budgets

Under **Budgets**, set:

- an organisation-wide monthly cap (by default, your pooled allowance),
- a default cap per seat, and overrides for individual seats,
- what happens at the limit: **soft alert** (email owners and admins, keep working, bill
  overage) or **hard stop** (refuse requests until next month or until you raise the cap).

Alerts go to owners and admins at 50%, 80% and 100% of each budget, once per month. Budgets reset
at the start of each calendar month (UTC).

## Audit log

The audit log records every request's metadata: time, member, key, model, input, cached and
output tokens, latency, status and the Phala receipt ID. It never contains prompts or code.

- **Verify** fetches the request's signed receipt from Phala's attested gateway and shows whether
  the upstream TEE was verified and required.
- **Export CSV** downloads up to 10,000 rows per request. Exports are themselves recorded under
  **Settings → Admin activity**.

## Billing

Trials last 14 days. To activate a plan, use **Billing → Request activation** or
[contact us](/contact). We send an order form and invoice, then switch the same organisation to
its plan. Nothing needs reconfiguring.

The billing page shows each month's statement, calculated from your audit log with the published
overage rates, and exports it as CSV.
