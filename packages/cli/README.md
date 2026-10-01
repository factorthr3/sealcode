# sealcode

Connect [Claude Code](https://code.claude.com) to [Sealcode](https://sealcode.ai), the
confidential AI coding gateway, in one command.

```bash
npx sealcode login
```

`login` opens your browser to approve the device, creates an API key for it and merges these
settings into `~/.claude/settings.json` (or `$CLAUDE_CONFIG_DIR/settings.json`):

| Variable                                                         | Value                   |
| ---------------------------------------------------------------- | ----------------------- |
| `ANTHROPIC_BASE_URL`                                             | Your Sealcode gateway   |
| `ANTHROPIC_AUTH_TOKEN`                                           | The new `sc_live_…` key |
| `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL` | `sealcode-pro`          |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL`                                  | `sealcode-fast`         |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`                       | `1`                     |
| `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`                         | `1`                     |

Everything else in the file is kept, and the original is backed up to
`settings.json.sealcode-backup` first. The file is written with permissions `0600` because it
holds a key.

```bash
npx sealcode doctor          # settings, conflicting ANTHROPIC_API_KEY, managed settings, connectivity
npx sealcode doctor --live   # also sends a one-token test request and prints its receipt ID
npx sealcode logout          # revokes this device's key and restores your original settings
```

Works on macOS, Linux and Windows (PowerShell). Requires Node.js 18.17 or later.

Claude and Claude Code are trademarks of Anthropic. Sealcode is not affiliated with or endorsed by
Anthropic.
