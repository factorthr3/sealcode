import 'server-only';
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { env } from './env';

/** RFC 6238 TOTP (SHA-1, 6 digits, 30-second steps), as every authenticator app implements. */
const STEP_SECONDS = 30;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) throw new Error('invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

const lastAccepted = new Map<string, number>();

/** Accepts the current step and one either side for clock drift, and never the same step twice. */
export function verifyTotp(
  secret: string,
  code: string,
  replayKey: string,
  now = Date.now(),
): boolean {
  const clean = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  for (const c of [counter - 1, counter, counter + 1]) {
    const expected = Buffer.from(totpAt(secret, c));
    if (timingSafeEqual(expected, Buffer.from(clean))) {
      if ((lastAccepted.get(replayKey) ?? -1) >= c) return false;
      lastAccepted.set(replayKey, c);
      return true;
    }
  }
  return false;
}

export function otpauthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`Sealcode:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=Sealcode&algorithm=SHA1&digits=6&period=30`;
}

// TOTP secrets are encrypted at rest with a key that exists only inside the TEE.
function key(): Buffer {
  const k = Buffer.from(env().TOTP_ENCRYPTION_KEY, 'base64');
  if (k.length !== 32) throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return k;
}

export function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('bad ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(data, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
