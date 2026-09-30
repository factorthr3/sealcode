import { describe, expect, it } from 'vitest';
import { MODEL_ALIASES, resolveModelAlias, upstreamModelFor } from '../src';

describe('resolveModelAlias', () => {
  it('accepts our aliases', () => {
    expect(resolveModelAlias('sealcode-pro')).toBe('sealcode-pro');
    expect(resolveModelAlias('sealcode-fast')).toBe('sealcode-fast');
    expect(resolveModelAlias('sealcode-pro[1m]')).toBe('sealcode-pro');
  });

  it("maps Claude Code's tiers: opus and sonnet to pro, haiku to fast", () => {
    expect(resolveModelAlias('claude-opus-4-8')).toBe('sealcode-pro');
    expect(resolveModelAlias('claude-sonnet-4-6')).toBe('sealcode-pro');
    expect(resolveModelAlias('claude-sonnet-4-6[1m]')).toBe('sealcode-pro');
    expect(resolveModelAlias('claude-haiku-4-5-20251001')).toBe('sealcode-fast');
  });

  it('rejects raw upstream IDs and unknown names', () => {
    expect(resolveModelAlias('z-ai/glm-5.3')).toBeNull();
    expect(resolveModelAlias('gpt-5')).toBeNull();
    expect(resolveModelAlias('')).toBeNull();
    expect(resolveModelAlias(42)).toBeNull();
    expect(resolveModelAlias('__proto__')).toBeNull();
  });

  it('maps aliases to the upstream IDs from the brief', () => {
    expect(upstreamModelFor('sealcode-pro')).toBe('z-ai/glm-5.3');
    expect(upstreamModelFor('sealcode-fast')).toBe('z-ai/glm-5.3-flash');
    for (const alias of Object.values(MODEL_ALIASES))
      expect(alias.upstream).not.toMatch(/^sealcode/);
  });
});
