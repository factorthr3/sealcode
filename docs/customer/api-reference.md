---
title: API reference
summary: Endpoints, authentication, models, headers, errors and limits.
order: 6
---

# API reference

Base URL: `https://api.sealcode.dev`

## Authentication

Send your key as either header:

```http
Authorization: Bearer sc_live_…
x-api-key: sc_live_…
```

## Endpoints

| Method and path                  | Format                  | Notes                                                                            |
| -------------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| `POST /v1/messages`              | Anthropic Messages      | Streaming and non-streaming, tools, prompt caching. For Claude Code.             |
| `POST /v1/chat/completions`      | OpenAI chat completions | Streaming and non-streaming, tool calls. For OpenCode, Cline, Continue and SDKs. |
| `GET /v1/models`                 | Anthropic or OpenAI     | Anthropic shape when `anthropic-version` is sent, OpenAI shape otherwise.        |
| `POST /v1/messages/count_tokens` | —                       | Not available (404). Claude Code falls back to a local estimate.                 |

Request bodies are forwarded as you send them, except for two fields. `model` is mapped to the
upstream model. `provider` is replaced with a TEE-only route that requires zero data retention.

## Models

| Alias           | Model         | Context   |
| --------------- | ------------- | --------- |
| `sealcode-pro`  | GLM 5.3       | 1M tokens |
| `sealcode-fast` | GLM 5.3 Flash | 1M tokens |

Anthropic model IDs are accepted for compatibility: `claude-*-opus-*` and `claude-*-sonnet-*` map
to `sealcode-pro`, and `claude-*-haiku-*` maps to `sealcode-fast`.

## Response headers

| Header                                  | Meaning                                                            |
| --------------------------------------- | ------------------------------------------------------------------ |
| `x-receipt-id`                          | The Phala receipt for this response. Verify it from the audit log. |
| `x-sealcode-request-id`                 | Sealcode's request ID, shown in the audit log.                     |
| `x-aci-identity`, `x-aci-keyset-digest` | Identity of Phala's attested gateway that signed the receipt.      |
| `retry-after`                           | Whole seconds to wait on a `429`.                                  |

## Errors

Errors Sealcode generates use the Anthropic envelope on `/v1/messages` and the OpenAI envelope on
`/v1/chat/completions`. Errors from the model provider are passed through unchanged.

| Status | Type                    | When                                                                                                                            |
| ------ | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request_error` | The body isn't a JSON object, or the upstream rejected it                                                                       |
| 401    | `authentication_error`  | Missing, unknown or revoked key                                                                                                 |
| 403    | `permission_error`      | Pilot ended or organisation suspended                                                                                           |
| 404    | `not_found_error`       | Unknown model                                                                                                                   |
| 413    | `request_too_large`     | Body over 32 MB                                                                                                                 |
| 429    | `rate_limit_error`      | Per-key rate limit (short `retry-after`) or exhausted hard-stop budget (`retry-after` until month end, `x-should-retry: false`) |
| 502    | `api_error`             | The upstream confidential gateway couldn't be reached                                                                           |

## Limits

| Plan       | Requests per minute per key |
| ---------- | --------------------------- |
| Pilot      | {{rpm.trial}}               |
| Team       | {{rpm.team}}                |
| Business   | {{rpm.business}}            |
| Enterprise | {{rpm.enterprise}}          |

Monthly token budgets are set per organisation and per seat under **Budgets**.
