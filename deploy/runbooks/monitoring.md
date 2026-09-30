# Monitoring and the status page

## Health endpoints

| Check       | URL                                                                                       | Healthy                                                   |
| ----------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Gateway     | `https://api.sealcode.dev/healthz`                                                        | `200 {"ok":true}`                                         |
| Web         | `https://sealcode.dev/api/health`                                                         | `200 {"ok":true}`                                         |
| Attestation | `https://sealcode.dev/api/attestation`                                                    | `mode: "tee"` and the compose hash of the current release |
| End to end  | `scripts/spike/run.ts` against the gateway with a monitoring key (`SPIKE_TARGET=gateway`) | All checks pass                                           |

The monitoring key belongs to an internal "Sealcode monitoring" org with a hard budget of 5M
tokens a month, so synthetic checks can't run up cost.

## Status page and uptime checks

Uptime monitoring and the public status page must run **outside** the CVM, or an outage would
take the status page down with it. This needs a third-party service. Choose one before launch
(for example Better Stack, Instatus or Atlassian Statuspage) and configure:

- 1-minute checks on the three health URLs, from at least two regions including the UK;
- a 5-minute synthetic end-to-end check with the monitoring key;
- a check that alerts if `/api/attestation` reports a compose hash other than the current
  release's (catches unexpected redeploys);
- paging to on-call for SEV1 conditions (see `incident.md`);
- a status page at `status.sealcode.dev` with components Gateway, Dashboard, Upstream (Phala).

Adding the service means a new subprocessor entry if it receives any personal data. Health checks
send none.

## Logs

All services log JSON lines through the allowlist logger: metadata only, never content. Read them
with `phala cvms logs sealcode --service <name>`. `--public-logs` stays off, since logs name
organisation IDs.

## Soak test

Before launch and after major releases, run the soak test (the brief's criterion is 24 hours at
20 concurrent sessions with zero dropped streams):

```bash
SOAK_URL=https://api.sealcode.dev SOAK_KEY=sc_live_… SOAK_SESSIONS=20 SOAK_MINUTES=1440 pnpm soak
```
