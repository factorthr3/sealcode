/**
 * Verify that sealcode.ai runs the published code inside a TEE.
 *
 *   npx tsx scripts/verify-attestation.ts --site https://sealcode.ai --ref v1.0.0
 *   npx tsx scripts/verify-attestation.ts --compose ./deploy/docker-compose.yml --offline
 *
 * 1. Sends a random nonce and gets a fresh TDX quote committing to it.
 * 2. Checks the compose hash, its measurement into RTMR3 and the event log.
 * 3. Compares the attested docker-compose.yml with the published one (from a git ref or a file).
 * 4. Unless --offline, asks Phala's public verifier to check the quote's Intel signature chain.
 *    For a fully trustless check, verify the quote locally with dcap-qvl.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { verifyAttestation, type AttestationDoc, type Check } from './attestation/verify';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const site = (arg('--site') ?? 'https://sealcode.ai').replace(/\/+$/, '');
const ref = arg('--ref');
const composePath = arg('--compose');
const offline = process.argv.includes('--offline');

function publishedCompose(): string | null {
  if (composePath) return readFileSync(composePath, 'utf8');
  if (ref)
    return execFileSync('git', ['show', `${ref}:deploy/docker-compose.yml`], { encoding: 'utf8' });
  return null;
}

const nonce = randomBytes(32).toString('hex');
const res = await fetch(`${site}/api/attestation?nonce=${nonce}`);
if (!res.ok) {
  console.error(`Could not fetch the attestation: HTTP ${res.status}`);
  process.exit(1);
}
const doc = (await res.json()) as AttestationDoc & {
  appId?: string;
  trustCenterUrl?: string;
  source?: { commit: string };
};
const checks: Check[] = verifyAttestation(doc, { nonce, publishedCompose: publishedCompose() });

if (!offline && doc.quote) {
  try {
    const v = await fetch('https://cloud-api.phala.com/api/v1/attestations/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hex: doc.quote }),
    });
    const body = (await v.json()) as { quote?: { verified?: boolean } };
    checks.push({
      name: 'Quote signature (Phala verifier)',
      ok: body.quote?.verified === true,
      detail: body.quote?.verified
        ? 'Intel TDX signature chain verified.'
        : `Verifier said: ${JSON.stringify(body).slice(0, 160)}`,
    });
  } catch (err) {
    checks.push({
      name: 'Quote signature (Phala verifier)',
      ok: false,
      detail: `Could not reach the verifier: ${(err as Error).message}`,
    });
  }
}

console.log(`\nSealcode attestation for ${site}`);
if (doc.source) console.log(`Claims source commit ${doc.source.commit}`);
console.log('');
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}\n    ${c.detail}`);
if (doc.trustCenterUrl) console.log(`\nIndependent report: ${doc.trustCenterUrl}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
process.exit(failed ? 1 : 0);
