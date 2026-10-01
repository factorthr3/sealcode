---
title: Claude Code quickstart
summary: Connect Claude Code to Sealcode in one command, check the setup and fix common problems.
order: 1
---

# Claude Code quickstart

Sealcode works with the Claude Code you already have. You need Node.js 18.17 or later and a
Sealcode account: your organisation's admin
invites you.

## 1. Connect with one command

```bash
npx sealcode login
```

The CLI prints a one-time code and opens your browser. Check the code matches, choose your
organisation and press **Approve**. The CLI then:

- creates an API key for this device (named after your computer),
- merges these settings into `~/.claude/settings.json`, keeping everything else in the file,
- backs up the original file to `~/.claude/settings.json.sealcode-backup`.

| Setting                                                          | Value                     |
| ---------------------------------------------------------------- | ------------------------- |
| `ANTHROPIC_BASE_URL`                                             | `https://api.sealcode.ai` |
| `ANTHROPIC_AUTH_TOKEN`                                           | your new `sc_live_…` key  |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` | `sealcode-pro`            |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`                                  | `sealcode-fast`           |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`                       | `1`                       |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`                         | `1`                       |

No browser on this machine (for example over SSH)? Run `npx sealcode login --no-browser` and open
the printed link on any device where you're signed in.

## 2. Start coding

```bash
claude
```

Run `/status` in Claude Code. The **Anthropic base URL** line should show
`https://api.sealcode.ai`, and the **Auth token** line should name `ANTHROPIC_AUTH_TOKEN`.

## 3. Check the setup

```bash
npx sealcode doctor          # settings, conflicts and connectivity
npx sealcode doctor --live   # also sends a one-token request and prints its receipt ID
```

## Manual setup

Prefer not to run the CLI? In the dashboard, open **Connect**, create a key and copy the settings
snippet, which has the key filled in, into `~/.claude/settings.json`. On Windows the file is
`%USERPROFILE%\.claude\settings.json`.

Never put the key in a project's `.claude/settings.json`: that file is committed to your
repository.

## Strict egress networks

With the settings above, Claude Code sends model requests only to Sealcode. Its WebFetch tool still
asks `api.anthropic.com` whether a domain is safe before fetching it; that check sends the domain,
not your code. If your firewall blocks that host, add this to `~/.claude/settings.json`:

```json
{ "skipWebFetchPreflight": true }
```

## Troubleshooting

| Symptom                                | Fix                                                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code asks you to log in         | The settings didn't load. Run `npx sealcode doctor`.                                                                                           |
| A warning about two credential sources | `ANTHROPIC_API_KEY` is set in your shell. Remove it from your shell profile, or run `/logout` in Claude Code to clear a saved claude.ai login. |
| `401` "API key has been revoked"       | An admin revoked this device's key. Run `npx sealcode login` again.                                                                            |
| `429` "monthly token budget"           | Your organisation or seat hit a hard-stop budget. Ask an admin to raise it under **Budgets**.                                                  |
| `403` "pilot ended"                    | Contact us to agree your plan: [sealcode.ai/contact](/contact).                                                                                |
| `400` naming an unrecognised field     | Make sure `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` is `1`, then update Claude Code.                                                            |

## Disconnect

```bash
npx sealcode logout
```

This revokes the device's key and puts back the original values of the settings Sealcode changed.
Any other changes you made since are kept.
