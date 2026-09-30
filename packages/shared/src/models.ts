/**
 * Model aliases are the only model names customers ever see. Swapping an upstream model is a
 * one-line change here; no customer configuration changes.
 *
 * Prices are Phala's list prices in USD per 1M tokens (https://inference.phala.com/v1/models,
 * checked 30 Sept 2026). `zdr` records whether a zero-data-retention route exists for the model;
 * the gateway sends `zdr: true` only when it does (see docs/spike-report.md).
 */
export interface ModelAlias {
  id: string;
  upstream: string;
  displayName: string;
  description: string;
  contextWindow: number;
  zdr: boolean;
  upstreamPricePerMTok: { input: number; output: number; cacheRead: number };
}

export const MODEL_ALIASES = {
  'sealcode-pro': {
    id: 'sealcode-pro',
    upstream: 'z-ai/glm-5.3',
    displayName: 'Sealcode Pro',
    description: 'Main coding model (GLM 5.3), 1M context, runs in a TEE',
    contextWindow: 1_048_576,
    zdr: true,
    upstreamPricePerMTok: { input: 1.4, output: 4.4, cacheRead: 0.26 },
  },
  'sealcode-fast': {
    id: 'sealcode-fast',
    upstream: 'z-ai/glm-5.3-flash',
    displayName: 'Sealcode Fast',
    description: 'Background tasks and quick edits (GLM 5.3 Flash), runs in a TEE',
    contextWindow: 1_048_576,
    zdr: true,
    upstreamPricePerMTok: { input: 0.15, output: 0.5, cacheRead: 0.03 },
  },
} as const satisfies Record<string, ModelAlias>;

export type ModelAliasId = keyof typeof MODEL_ALIASES;

export const MODEL_ALIAS_IDS = Object.keys(MODEL_ALIASES) as ModelAliasId[];

/** Settings the CLI writes so Claude Code's three model tiers resolve to our aliases. */
export const CLAUDE_CODE_TIER_MODELS = {
  ANTHROPIC_DEFAULT_OPUS_MODEL: 'sealcode-pro',
  ANTHROPIC_DEFAULT_SONNET_MODEL: 'sealcode-pro',
  ANTHROPIC_DEFAULT_HAIKU_MODEL: 'sealcode-fast',
} as const satisfies Record<string, ModelAliasId>;

export function isModelAlias(value: string): value is ModelAliasId {
  return Object.hasOwn(MODEL_ALIASES, value);
}

/**
 * Resolve whatever model name a client sent to one of our aliases.
 *
 * Claude Code sends Anthropic model IDs (`claude-opus-…`, `claude-sonnet-…`, `claude-haiku-…`)
 * unless the `ANTHROPIC_DEFAULT_*_MODEL` settings are applied, so those map by tier: haiku to
 * `sealcode-fast`, everything else to `sealcode-pro`. A `[1m]` context suffix is ignored. Raw
 * upstream IDs are rejected on purpose: customers only ever address aliases.
 */
export function resolveModelAlias(requested: unknown): ModelAliasId | null {
  if (typeof requested !== 'string') return null;
  const name = requested
    .trim()
    .replace(/\[1m\]$/i, '')
    .toLowerCase();
  if (isModelAlias(name)) return name;
  if (name.startsWith('claude') || name.startsWith('anthropic')) {
    return name.includes('haiku') ? 'sealcode-fast' : 'sealcode-pro';
  }
  return null;
}

export function upstreamModelFor(alias: ModelAliasId): string {
  return MODEL_ALIASES[alias].upstream;
}
