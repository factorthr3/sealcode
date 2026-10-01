---
title: Continue quickstart
summary: Configure Continue to use Sealcode models for chat and edits.
order: 4
---

# Continue quickstart

Continue uses Sealcode through the OpenAI-compatible provider.

1. In the Sealcode dashboard, open **API keys** and create a key for this device.
2. Store it as a Continue secret named `SEALCODE_API_KEY`, or in your local `.env`.
3. Add the models to `~/.continue/config.yaml`:

```yaml
name: Sealcode
version: 1.0.0
schema: v1
models:
  - name: Sealcode Pro
    provider: openai
    model: sealcode-pro
    apiBase: https://api.sealcode.ai/v1
    apiKey: ${{ secrets.SEALCODE_API_KEY }}
    roles: [chat, edit, apply]
  - name: Sealcode Fast
    provider: openai
    model: sealcode-fast
    apiBase: https://api.sealcode.ai/v1
    apiKey: ${{ secrets.SEALCODE_API_KEY }}
    roles: [chat, edit]
```

4. Reload VS Code or JetBrains and pick **Sealcode Pro** in Continue's model selector.

Tab autocomplete isn't supported yet: Sealcode serves chat endpoints only.
