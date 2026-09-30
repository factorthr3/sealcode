/**
 * Live Phala checks. Runs only under `pnpm test:live` with PHALA_API_KEY set; never in CI by
 * default.
 */
import { describe, expect, it } from 'vitest';
import { ALL_CHECKS, type Target } from './checks';

const apiKey = process.env.PHALA_API_KEY;
const live = process.env.SEALCODE_LIVE === '1' && !!apiKey;

const target: Target = {
  baseUrl: 'https://inference.phala.com',
  receiptsBaseUrl: 'https://inference.phala.com',
  apiKey: apiKey ?? '',
  models: { main: 'z-ai/glm-5.3', fast: 'z-ai/glm-5.3-flash' },
  sendProvider: true,
};

describe.skipIf(!live)('Phala compatibility (live)', () => {
  for (const check of ALL_CHECKS) {
    it(check.name, async () => {
      const r = await check(target);
      expect(r.outcome, r.evidence.join('\n')).not.toBe('fail');
    });
  }
});
