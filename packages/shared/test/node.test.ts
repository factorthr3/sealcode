import { describe, expect, it } from 'vitest';
import {
  generateApiKey,
  hashApiKey,
  isApiKeyFormat,
  signPlaygroundToken,
  toBase62,
  verifyPlaygroundToken,
} from '../src/node';

const PEPPER = 'p'.repeat(32);
const SECRET = 's'.repeat(32);

describe('API keys', () => {
  it('uses sc_live_ plus 43 base62 characters', () => {
    const { key, prefix, last4 } = generateApiKey();
    expect(isApiKeyFormat(key)).toBe(true);
    expect(prefix).toBe('sc_live_');
    expect(key.endsWith(last4)).toBe(true);
    expect(generateApiKey().key).not.toBe(key);
  });

  it('encodes the full 256-bit range', () => {
    expect(toBase62(new Uint8Array(32).fill(255), 43)).toHaveLength(43);
    expect(toBase62(new Uint8Array(32), 43)).toBe('0'.repeat(43));
  });

  it('hashes with the pepper', () => {
    const { key } = generateApiKey();
    expect(hashApiKey(key, PEPPER)).toBe(hashApiKey(key, PEPPER));
    expect(hashApiKey(key, PEPPER)).not.toBe(hashApiKey(key, 'q'.repeat(32)));
    expect(hashApiKey(key, PEPPER)).not.toContain(key);
    expect(() => hashApiKey(key, 'short')).toThrow();
  });
});

describe('playground tokens', () => {
  it('round-trips and expires', () => {
    const now = Date.now();
    const { token, payload } = signPlaygroundToken(SECRET, 60, now);
    expect(token.startsWith('sc_demo_')).toBe(true);
    expect(verifyPlaygroundToken(token, SECRET, now)).toEqual(payload);
    expect(verifyPlaygroundToken(token, SECRET, now + 61_000)).toBeNull();
  });

  it('rejects tampering and the wrong secret', () => {
    const { token } = signPlaygroundToken(SECRET, 60);
    expect(verifyPlaygroundToken(token, 't'.repeat(32))).toBeNull();
    const [body, sig] = token.split('.');
    const forged = `sc_demo_${Buffer.from(JSON.stringify({ v: 1, jti: 'x', exp: 9e9 })).toString('base64url')}.${sig}`;
    expect(verifyPlaygroundToken(forged, SECRET)).toBeNull();
    expect(verifyPlaygroundToken(`${body}.`, SECRET)).toBeNull();
    expect(verifyPlaygroundToken('sc_live_abc', SECRET)).toBeNull();
  });
});
