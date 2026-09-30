# Phase 0 spike report

**Status: partially run (30 Sept 2026).** No Phala API key was available in the build environment,
so the live checks have not run against Phala. Every check that needs no key has been done: the
public model catalog, the Claude Code gateway documentation and the Phala documentation. The live
checks are automated and take one command to run:

```bash
PHALA_API_KEY=... pnpm spike                                   # all live API checks
PHALA_API_KEY=... scripts/spike/claude-code-e2e.sh phala       # Claude Code end to end
DISABLE_BETAS=1 PHALA_API_KEY=... scripts/spike/claude-code-e2e.sh phala
```

`pnpm spike` writes `docs/spike-results.json`. When the live run is complete, update the table
below and the recommendation.

**Recommendation: conditional go.** The build continues against the mock upstream, because the
desk research found no blockers. Launch stays blocked until the two live checks that decide
viability pass: tool use through `/v1/messages`, and the Claude Code end-to-end task. If tool use
fails, the fallback is the one in the brief: the gateway translates Anthropic Messages to OpenAI
chat completions. The public catalog lists `tools` and `tool_choice` for both models, so that
fallback path is viable. It adds about a week to Milestone 1.

## Results

| #   | Item                         | Status                        | Finding                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tool use                     | **Not run (needs key)**       | Catalog lists `tools`, `tool_choice` and `parallel_tool_calls` for both models, but Phala's Messages reference still doesn't document `tools`. `checkToolUse` tests streaming and non-streaming.                                                                                                                                    |
| 2   | Stream shape                 | **Not run (needs key)**       | `checkStreamShape` checks the event order, `content-type: text/event-stream` and usage on `message_delta`.                                                                                                                                                                                                                          |
| 3   | Usage and caching            | **Not run (needs key)**       | Catalog prices cache reads: GLM 5.3 at $0.26/M against $1.40/M uncached, Flash at $0.03/M. `checkUsageAndCaching` sends a ~6K-token cacheable system prompt twice and records `cache_read_input_tokens`.                                                                                                                            |
| 4   | Receipts                     | **Not run (needs key)**       | Docs confirm `x-receipt-id` on every response, plus `x-aci-identity` and `x-aci-keyset-digest`. Receipts are fetched from `GET /v1/aci/receipts/{id}` with **our** Phala key, after the stream ends. Customers therefore verify receipts through our dashboard, which proxies receipts for their own requests only.                 |
| 5   | Routing constraints          | **Partly verified**           | Both models are listed with `is_tee: true`, and both appear under `?zdr=true` (the filter returned all 23 models, so treat this as unconfirmed). GLM 5.3 is served by `phala`; **GLM 5.3 Flash is served by `near-ai`**, which goes on the subprocessor list. `checkRoutingConstraints` confirms the `provider` object is accepted. |
| 6   | Claude Code end to end       | **Not run (needs key)**       | `scripts/spike/claude-code-e2e.sh` runs a multi-step fix-the-tests task on a fixture repo with `claude -p`, counting turns and 4xx errors. Run it with and without `DISABLE_BETAS=1`.                                                                                                                                               |
| 7   | Claude Code gateway protocol | **Done (docs)**               | See below.                                                                                                                                                                                                                                                                                                                          |
| 8   | Context limits               | **Not run (needs key)**       | `checkContextLimit` sends ~1.3M tokens to Flash. Claude Code assumes a 200K window for unrecognised model IDs, so it compacts long before GLM's 1M limit. This error path matters mostly for clients that set a larger window.                                                                                                      |
| 9   | TLS inside the CVM           | **Done (docs), not deployed** | Phala's `dstack-ingress` (HAProxy, L4) terminates TLS inside the CVM, gets Let's Encrypt certificates by DNS-01 with keys generated in the TEE, supports several domains via `DOMAINS` and `ROUTING_MAP`, and publishes evidence at `/evidences/`. We use it in `deploy/docker-compose.yml`. Confirm on the first deploy.           |
| 10  | Latency baseline             | **Not run (needs key)**       | `checkLatency` measures median TTFT and tokens/s for both models. Run it from a UK machine.                                                                                                                                                                                                                                         |

Also checked:

- **`count_tokens`**: optional. Without it, Claude Code falls back to a character-based estimate.
  The gateway forwards it, and a 404 from Phala is harmless.
- **Fields Claude Code sends to unrecognised model IDs**: `checkClaudeCodeFields` probes each one.
  Gateway aliases are "unrecognised", so Claude Code sends everything current Claude models accept:
  adaptive `thinking`, `output_config` (effort), `context_management` and beta tool fields.

## Claude Code gateway protocol (item 7)

Sources: [gateway compatibility guide](https://code.claude.com/docs/en/llm-gateway-protocol),
[connection guide](https://code.claude.com/docs/en/llm-gateway-connect).

**Endpoints.** `POST /v1/messages` (inference posts to `/v1/messages?beta=true`, so match on the
path), optional `POST /v1/messages/count_tokens`, `GET /v1/models?limit=1000` for discovery, and a
best-effort `HEAD /api/hello` warming probe.

**Request headers.** Forward `anthropic-version` and `anthropic-beta` unchanged, and treat
`anthropic-*` as an open list. Don't allowlist beta values. The credential arrives in
`Authorization: Bearer` (`ANTHROPIC_AUTH_TOKEN`), `x-api-key` (`ANTHROPIC_API_KEY`) or both
(`apiKeyHelper`). `x-claude-code-session-id`, `x-claude-code-agent-id` and
`x-claude-code-parent-agent-id` are ours to consume. We don't forward or store them.

**Body.** Pass fields through unchanged, including `cache_control` wherever it appears, and keep
`system` as an array in its original order. Changing `system` defeats caching and the attribution
block's position. The gateway rewrites only `model` and `provider`.

**Response headers.** Return `content-type: text/event-stream` on streams; `retry-after` as integer
seconds (a value above 60 makes Claude Code show the error immediately instead of retrying); pass
through `x-should-retry` and `anthropic-ratelimit-unified-*`.

**Streaming.** Never buffer. Relay every event in order, including `ping`. Claude Code aborts a
stream after five minutes without bytes.

**Errors and compaction.** Forward upstream error bodies unmodified. Claude Code matches on the
wording: it compacts and retries only on a recognised "prompt is too long" error, and it retries
without `thinking` when the upstream rejects that field. Wrapping upstream errors breaks both.

**Model discovery.** Off unless `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1`. The response is
`{"data":[{"id","display_name","description"}]}`, but Claude Code keeps only IDs containing `claude`
or `anthropic`. Our `sealcode-*` aliases would be filtered out, so the CLI relies on the
`ANTHROPIC_DEFAULT_{OPUS,SONNET,HAIKU}_MODEL` variables. `/v1/models` serves the Anthropic shape
when an `anthropic-version` header is present and the OpenAI shape otherwise, for OpenCode, Cline
and Continue.

**Beta fields.** Rejections of `context_management` and beta tool fields are not retried by Claude
Code. Until the live spike shows Phala accepts them, the CLI also sets
`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` (see [DECISIONS.md](./DECISIONS.md)).

**Egress.** `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` stops non-essential traffic. It doesn't
cover the WebFetch domain check, which still calls `api.anthropic.com`; strict-egress customers
set `"skipWebFetchPreflight": true`. Fast mode's availability check also calls `api.anthropic.com`
directly, which is irrelevant for our models.

## Commercial finding for the legal checklist

Anthropic's gateway documentation states that it "doesn't support routing Claude Code to non-Claude
models through any gateway". This is a support statement, not necessarily a licence restriction,
but it bears directly on the brief's first legal check (commercial use of Claude Code with
third-party backends) and on the risk that a Claude Code update breaks compatibility. Resolve it
with counsel before charging anyone. Keep the marketing copy to "works with Claude Code" and keep
OpenCode, Cline and Continue documented as first-class alternatives.
