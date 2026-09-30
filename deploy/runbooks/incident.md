# Incident runbook

## Severity

| Level | Examples                                                                                     | Response                                                                  |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| SEV1  | Gateway down for all customers; suspected exposure of customer content; attestation mismatch | Page on-call now; status page within 15 minutes; updates every 30 minutes |
| SEV2  | Elevated errors or latency; Phala upstream degraded; sign-in or dashboard down               | On-call within 30 minutes; status page within 1 hour                      |
| SEV3  | A single customer affected; one model degraded; emails delayed                               | Next working day                                                          |

## First 15 minutes

1. **Acknowledge** the alert and open an incident channel. Name one incident lead.
2. **Check health.** Run `curl -s https://api.sealcode.dev/healthz`, `curl -sI https://sealcode.dev/api/health`,
   and `phala cvms logs sealcode --service gateway`. Logs are metadata only.
3. **Check upstream.** Phala status, and whether gateway logs show `upstream.unreachable` or a spike
   in 5xx `error_type`.
4. **Post on the status page**, even if all you can say is "investigating".

## Playbooks

**Upstream (Phala) outage.** The gateway returns 502 `api_error`, and Claude Code retries
automatically. There is no fallback provider by design: a request must never leave the TEE route.
Keep the status page updated and link Phala's status.

**Gateway crash loop.** Check for a bad release (compare the compose hash on `/trust` with the
release tag). Roll back by redeploying the previous tag. `migrate` runs first; migrations are
additive, so the older gateway works against the newer schema.

**Database unavailable.** Key lookups fail and requests return 500. Check the `postgres`
container and its volume. If the data is lost, follow `backup-restore.md`.

**Budget or rate-limit misfire.** If customers are wrongly blocked, raise their budget from the
dashboard (as staff, via their org) or temporarily switch the org to soft mode. The gateway picks
it up within 3 seconds.

**Suspected content exposure (SEV1).** Treat any sign of prompt or code content in logs, email or
storage as a breach.

1. Stop the leak. Redeploy the last known-good release, or stop the affected service.
2. Preserve evidence: logs, the compose hash, the image digests.
3. Tell affected customers without undue delay, in line with the DPA. Where personal data is
   involved, the ICO must be notified within 72 hours of becoming aware.
4. Afterwards, add a test that would have caught it. The log-scan test is the model.

**Attestation mismatch.** If `/trust` or `verify-attestation.ts` shows a compose hash that
doesn't match the release tag, assume compromise until proven otherwise. Stop the CVM, redeploy
from the tag, rotate all sealed secrets and investigate how the deploy happened.

**Leaked customer key.** Revoke it from the dashboard (effective within 5 seconds) and tell the
customer. `sc_live_` keys are detectable by GitHub secret scanning.

## After the incident

Write a blameless review within 5 working days: timeline, impact (requests and customers
affected), root cause, what went well, and actions with owners. Publish a summary on the status
page for SEV1 and SEV2.
