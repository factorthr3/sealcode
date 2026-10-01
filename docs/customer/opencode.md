---
title: OpenCode quickstart
summary: Use Sealcode as an OpenAI-compatible provider in OpenCode.
order: 2
---

# OpenCode quickstart

OpenCode talks to Sealcode's OpenAI-compatible endpoint, `https://api.sealcode.ai/v1`.

## 1. Create a key

In the dashboard, open **API keys** and create a key named after this device. Store it in an
environment variable, not in a committed file:

```bash
export SEALCODE_API_KEY=sc_live_…
```

## 2. Add Sealcode as a provider

Add this to `~/.config/opencode/opencode.json` (or `opencode.json` in a project, with the key
coming from the environment as shown):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "sealcode": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Sealcode",
      "options": {
        "baseURL": "https://api.sealcode.ai/v1",
        "apiKey": "{env:SEALCODE_API_KEY}"
      },
      "models": {
        "sealcode-pro": { "name": "Sealcode Pro (GLM 5.3)" },
        "sealcode-fast": { "name": "Sealcode Fast (GLM 5.3 Flash)" }
      }
    }
  },
  "model": "sealcode/sealcode-pro",
  "small_model": "sealcode/sealcode-fast"
}
```

## 3. Check it

Start `opencode`, run `/models` and choose **Sealcode Pro**. Requests appear in your organisation's
audit log within a second, each with a receipt you can verify.
