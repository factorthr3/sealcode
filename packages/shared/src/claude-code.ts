import { CLAUDE_CODE_TIER_MODELS } from './models';

/**
 * Settings that connect Claude Code to Sealcode. The CLI merges these into the `env` block of
 * `~/.claude/settings.json`, and the dashboard's Connect page shows the same snippet.
 */
export const CLAUDE_CODE_FIXED_ENV = {
  ...CLAUDE_CODE_TIER_MODELS,
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  // Until the live spike confirms Phala accepts context_management and beta tool fields.
  CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
} as const;

export function claudeCodeEnv(baseUrl: string, apiKey: string): Record<string, string> {
  return {
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ...CLAUDE_CODE_FIXED_ENV,
  };
}

/** Every env key Sealcode manages, so logout can remove exactly these and nothing else. */
export const CLAUDE_CODE_MANAGED_KEYS = Object.keys(claudeCodeEnv('', ''));
