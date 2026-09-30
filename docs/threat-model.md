# Sealcode threat model

Version 1, 30 Sept 2026. Review it at each release that changes the gateway, the compose file or
the trust boundary.

## What we protect

| Asset                                                            | Why it matters                                                                               |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Customer request content** (prompts, source code, completions) | The product's promise. Confidentiality comes first.                                          |
| API keys                                                         | They let anyone spend a customer's budget and read nothing else, but leaks are embarrassing. |
| Admin accounts                                                   | They control keys, budgets and the audit log.                                                |
| Audit metadata                                                   | Reveals who worked when and how much; confidential to each org.                              |
| Sealcode's Phala key and sealed secrets                          | Upstream spend; key-hash pepper; TOTP and backup encryption keys.                            |
| Attestation integrity                                            | Customers' only independent assurance of what runs.                                          |

## Trust boundary

```
Developer laptop ──TLS──▶ [ CVM: ingress → gateway → Postgres | web ] ──TLS──▶ [ Phala attested gateway ] ──▶ [ GPU TEE model ]
   outside                         inside TEE (Intel TDX)                          inside TEE                   inside TEE
```

Content is plaintext in three places: the developer's machine, our gateway's memory and the
model's enclave. The first is outside our boundary. The other two are hardware-isolated from the
host, Phala staff and our operators.

## Actors

- **External attacker**: the internet, including stolen-key holders and playground abusers.
- **Malicious or compromised Sealcode operator**: can deploy code and set sealed variables, but
  can't read TEE memory.
- **Cloud host or Phala insider**: controls the hardware and hypervisor, not the TEE.
- **Other tenants**: legitimate customers trying to reach each other's data.
- **Compromised dependency**: code we ship without writing it.

## Threats and mitigations

| #   | Threat                                                                          | Mitigation                                                                                                                                                                                                               | Residual risk                                                                          |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| T1  | Host or Phala insider reads request content from memory or disk                 | TDX memory encryption; TLS terminates inside the CVM (dstack-ingress, TEE-generated keys); no content written to disk                                                                                                    | TEE side channels; trust in Intel TDX and NVIDIA CC                                    |
| T2  | Operator deploys code that logs or exfiltrates content                          | Public source, digest-pinned images, measured compose hash, `verify-attestation.ts`, Phala Trust Center listing                                                                                                          | Customers must actually verify; a malicious change is detectable, not preventable      |
| T3  | Operator redirects upstream traffic to a non-TEE endpoint through configuration | Production upstream URL compiled into the image; every request forces `provider.aci_verified`; client `provider` discarded (tested); per-request receipts show `upstream.verified`                                       | Reliance on Phala's router honouring `aci_verified` (receipts make violations visible) |
| T4  | Content leaks into logs, error trackers or crash output                         | Allowlist logger (drops unknown fields, redacts free text and credentials); `console` silenced in production; errors reduced to name and code; log-scan test across the gateway suite and real sockets; no error tracker | New code paths that bypass the logger; mitigated by lint (`no-console`) and review     |
| T5  | Content leaks through the web app                                               | The playground calls the gateway directly; the web app handles only tokens and receipt IDs; no dashboard feature reads content                                                                                           | None identified                                                                        |
| T6  | Cross-tenant data access                                                        | Every tenant query goes through `forOrg()` and filters `org_id` in SQL, including mutations by ID; test exercises every function against another org's IDs; receipts proxied only for the org's own IDs                  | New queries written outside `forOrg()`; mitigated by convention and review             |
| T7  | Stolen or leaked API key                                                        | `sc_live_` prefix for secret scanning; HMAC-SHA256 with pepper at rest; per-device keys; revocation within 5 s; per-key rate limits; hard-stop budgets                                                                   | Spend until revoked                                                                    |
| T8  | Admin account takeover                                                          | Magic links (single use, 15 min, consumed on POST); mandatory TOTP for owners, admins and staff, with replay protection; secrets encrypted at rest                                                                       | Email account compromise plus TOTP device compromise                                   |
| T9  | Credential stuffing or key enumeration                                          | 256-bit keys; malformed keys rejected before lookup; negative cache and single-flight lookups under concurrency (tested)                                                                                                 | Volumetric DoS (see T11)                                                               |
| T10 | Playground abuse (free inference, prompt injection into our systems)            | Signed 15-minute tokens; 12 requests per token; per-minute limit; 1,024 output tokens; 48 KB bodies; no tools; global daily cap; CORS limited to our origin                                                              | Distributed abuse up to the daily cap (a cost bound, not a confidentiality issue)      |
| T11 | Denial of service                                                               | Per-key buckets; body size limits; Phala's own edge                                                                                                                                                                      | Single replica and single upstream: see the brief's risk table                         |
| T12 | Supply-chain compromise                                                         | Lockfile committed; minimal runtime dependencies (gateway bundles hono, zod and postgres; the CLI has none); `pnpm audit` in release checks; digest-pinned base images                                                   | Upstream package compromise before detection                                           |
| T13 | Database or backup theft                                                        | Postgres only reachable inside the compose network; backups AES-256 encrypted before touching disk, key sealed in the TEE plus offline escrow; no content in the database                                                | Escrow compromise exposes metadata only                                                |
| T14 | CLI tampering with a developer's machine                                        | CLI touches only its own `env` keys, backs up first, refuses to rewrite invalid JSON, writes `0600`, zero dependencies                                                                                                   | npm account compromise of the `sealcode` package (use 2FA and provenance on publish)   |
| T15 | Attestation forged or replayed                                                  | Report data binds a caller-chosen nonce; RTMR3 replay and event-digest checks; Intel signature chain via Phala verifier or dcap-qvl                                                                                      | Event-digest formula to be confirmed against a real CVM                                |

## Out of scope

- The developer's laptop and the Claude Code client, including Claude Code's own telemetry
  (disabled by the CLI) and the WebFetch domain check (documented `skipWebFetchPreflight`).
- Model output quality or safety.
- Phala's and the model providers' internal security, beyond what their attestations and
  receipts prove.

## Open items before general availability

1. Independent penetration test of the gateway and web app.
2. Confirm the dstack event-digest formula and TLS passthrough on the first production deploy.
3. Publish the `sealcode` npm package with provenance.
4. External uptime monitoring and a status page (`deploy/runbooks/monitoring.md`).
