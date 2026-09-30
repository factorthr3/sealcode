/**
 * Token usage normalised across the Anthropic and OpenAI wire formats.
 *
 * `inputTokens` excludes cache reads. `cacheWriteTokens` are priced as ordinary input.
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const ZERO_USAGE: TokenUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

export function totalTokens(u: TokenUsage): number {
  return u.inputTokens + u.outputTokens + u.cacheReadTokens + u.cacheWriteTokens;
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

/**
 * Merge an Anthropic `usage` object (from `message_start`, `message_delta` or a non-streamed
 * message) into running totals. Later frames carry cumulative counts, so present fields replace
 * earlier values rather than adding to them.
 */
export function mergeAnthropicUsage(current: TokenUsage, usage: unknown): TokenUsage {
  if (!usage || typeof usage !== 'object') return current;
  const u = usage as Record<string, unknown>;
  return {
    inputTokens: count(u.input_tokens) ?? current.inputTokens,
    outputTokens: count(u.output_tokens) ?? current.outputTokens,
    cacheReadTokens: count(u.cache_read_input_tokens) ?? current.cacheReadTokens,
    cacheWriteTokens: count(u.cache_creation_input_tokens) ?? current.cacheWriteTokens,
  };
}

/** Normalise an OpenAI chat-completions `usage` object. `prompt_tokens` includes cached tokens. */
export function fromOpenAIUsage(usage: unknown): TokenUsage | null {
  if (!usage || typeof usage !== 'object') return null;
  const u = usage as Record<string, unknown>;
  const prompt = count(u.prompt_tokens) ?? 0;
  const details = u.prompt_tokens_details as Record<string, unknown> | undefined;
  const cached = Math.min(count(details?.cached_tokens) ?? 0, prompt);
  return {
    inputTokens: prompt - cached,
    outputTokens: count(u.completion_tokens) ?? 0,
    cacheReadTokens: cached,
    cacheWriteTokens: 0,
  };
}
