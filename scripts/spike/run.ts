/**
 * Phase 0 spike runner.
 *
 *   PHALA_API_KEY=... pnpm spike                      # against Phala (the real spike)
 *   SPIKE_TARGET=gateway SPIKE_API_KEY=sc_live_... pnpm spike   # against a Sealcode gateway
 *   SPIKE_TARGET=mock pnpm spike                      # harness self-test against the mock upstream
 *   SPIKE_ONLY=checkToolUse,checkReceipts pnpm spike   # run a subset
 *
 * Writes docs/spike-results.json. Evidence is metadata only.
 */
import { writeFileSync } from 'node:fs';
import { ALL_CHECKS, type CheckResult, type Target } from './checks';

function target(): Target {
  const kind = process.env.SPIKE_TARGET ?? 'phala';
  if (kind === 'phala') {
    const apiKey = process.env.PHALA_API_KEY;
    if (!apiKey) {
      console.error('Set PHALA_API_KEY to run the spike against Phala.');
      process.exit(2);
    }
    return {
      baseUrl: 'https://inference.phala.com',
      receiptsBaseUrl: 'https://inference.phala.com',
      apiKey,
      models: { main: 'z-ai/glm-5.3', fast: 'z-ai/glm-5.3-flash' },
      sendProvider: true,
    };
  }
  if (kind === 'mock') {
    const baseUrl = process.env.SPIKE_BASE_URL ?? 'http://127.0.0.1:8788';
    return {
      baseUrl,
      receiptsBaseUrl: baseUrl,
      apiKey: 'mock-phala-key',
      models: { main: 'z-ai/glm-5.3', fast: 'z-ai/glm-5.3-flash' },
      sendProvider: true,
    };
  }
  return {
    baseUrl: process.env.SPIKE_BASE_URL ?? 'http://127.0.0.1:8787',
    apiKey: process.env.SPIKE_API_KEY ?? '',
    models: { main: 'sealcode-pro', fast: 'sealcode-fast' },
    sendProvider: false,
  };
}

const only = process.env.SPIKE_ONLY?.split(',');
const t = target();
const results: CheckResult[] = [];
for (const check of ALL_CHECKS) {
  if (only && !only.includes(check.name)) continue;
  let r: CheckResult;
  try {
    r = await check(t);
  } catch (err) {
    r = {
      id: check.name,
      title: check.name,
      outcome: 'fail',
      evidence: [`threw ${(err as Error).name}`],
    };
  }
  results.push(r);
  const mark = r.outcome === 'pass' ? 'PASS' : r.outcome === 'fail' ? 'FAIL' : 'SKIP';
  console.log(`${mark}  ${r.title}`);
  for (const line of r.evidence) console.log(`      ${line}`);
}

writeFileSync(
  new URL('../../docs/spike-results.json', import.meta.url),
  `${JSON.stringify({ ranAt: new Date().toISOString(), target: t.baseUrl, results }, null, 2)}\n`,
);
const failed = results.filter((r) => r.outcome === 'fail').length;
console.log(
  `\n${results.length - failed}/${results.length} checks passed. Results in docs/spike-results.json`,
);
process.exit(failed ? 1 : 0);
