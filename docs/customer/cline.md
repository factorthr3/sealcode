---
title: Cline quickstart
summary: Point Cline in VS Code at Sealcode's OpenAI-compatible endpoint.
order: 3
---

# Cline quickstart

1. In the Sealcode dashboard, open **API keys** and create a key for this device.
2. In VS Code, open Cline's settings (the gear icon in the Cline panel).
3. Set:

| Setting      | Value                        |
| ------------ | ---------------------------- |
| API Provider | OpenAI Compatible            |
| Base URL     | `https://api.sealcode.ai/v1` |
| API Key      | your `sc_live_…` key         |
| Model ID     | `sealcode-pro`               |

4. Save, then ask Cline to do something small, such as explaining a function, to confirm the
   connection. The request appears in your audit log.

Use `sealcode-fast` as the model ID if you want quicker, cheaper responses for simple edits.

Cline stores the key in VS Code's secret storage. Revoke it from the dashboard's **API keys** page
if the machine is lost.
