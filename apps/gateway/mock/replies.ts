/**
 * Canned coding answers so the local playground feels real without a Phala key. Picked by
 * keyword; production traffic never reaches this file.
 */
const REPLIES: { match: RegExp; text: string }[] = [
  {
    match: /\b(test|tests|spec|vitest|jest|unit)\b/i,
    text: `Here's a focused Vitest suite. It pins the behaviour at the edges, where money bugs usually hide:

\`\`\`ts
import { describe, expect, it } from 'vitest';
import { formatGBP } from './money';

describe('formatGBP', () => {
  it('formats pence as pounds with two decimals', () => {
    expect(formatGBP(1050)).toBe('£10.50');
  });

  it('adds thousands separators', () => {
    expect(formatGBP(123456)).toBe('£1,234.56');
  });

  it('rejects negative amounts', () => {
    expect(() => formatGBP(-1)).toThrow(RangeError);
  });
});
\`\`\`

Run it with \`pnpm vitest run money\`. If \`formatGBP\` uses \`Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })\`, the first two cases pass for free.`,
  },
  {
    match: /\b(regex|postcode|validate|validation|iban|sort code)\b/i,
    text: `A UK postcode check that accepts the common formats and normalises the spacing:

\`\`\`ts
const POSTCODE = /^([A-Z]{1,2}\\d[A-Z\\d]?)\\s*(\\d[A-Z]{2})$/i;

export function normalisePostcode(input: string): string | null {
  const match = POSTCODE.exec(input.trim());
  return match ? \`\${match[1]} \${match[2]}\`.toUpperCase() : null;
}

normalisePostcode('sw1a2aa'); // 'SW1A 2AA'
normalisePostcode('EC1A 1BB'); // 'EC1A 1BB'
normalisePostcode('12345'); // null
\`\`\`

A regex only checks the shape. To confirm a postcode exists, look it up against the ONS Postcode Directory or an address API.`,
  },
  {
    match: /\b(sql|query|database|postgres|injection)\b/i,
    text: `Never build SQL by concatenating strings. Pass values as parameters so the driver keeps data and code apart:

\`\`\`ts
// Vulnerable: a crafted accountId can rewrite the query.
await db.query(\`SELECT * FROM payments WHERE account_id = '\${accountId}'\`);

// Safe: the value travels separately from the SQL text.
await db.query('SELECT id, amount_pence, created_at FROM payments WHERE account_id = $1', [accountId]);
\`\`\`

While you're there, select only the columns you need rather than \`*\`, and add an index on \`payments(account_id, created_at)\` if this query backs a statement page.`,
  },
  {
    match: /\b(refactor|clean|simplify|readable|smell)\b/i,
    text: `Pull the branching into a lookup table and name the business rule:

\`\`\`ts
// Before
function feeFor(tier: string, amount: number) {
  if (tier === 'basic') return amount * 0.02;
  else if (tier === 'plus') return amount * 0.015;
  else if (tier === 'premium') return 0;
  throw new Error('unknown tier');
}

// After
const FEE_RATE = { basic: 0.02, plus: 0.015, premium: 0 } as const;
type Tier = keyof typeof FEE_RATE;

export function feeFor(tier: Tier, amountPence: number): number {
  return Math.round(amountPence * FEE_RATE[tier]);
}
\`\`\`

The \`Tier\` type turns an unknown tier into a compile error, and working in whole pence avoids floating-point drift.`,
  },
  {
    match: /\b(secret|key|token|password|credential|env)\b/i,
    text: `Keep secrets out of the repo and out of logs:

1. Read them from the environment at start-up, and fail fast when one is missing.
2. Validate them once with a schema, so a typo fails at boot rather than on the first request.
3. Never log the config object. Log the *names* of missing variables, not values.

\`\`\`ts
import { z } from 'zod';

const Env = z.object({ PAYMENTS_API_KEY: z.string().min(32) });
export const env = Env.parse(process.env); // throws: "PAYMENTS_API_KEY: Required"
\`\`\`

Pair it with a secret scanner in CI, so a key committed by mistake is caught before it's pushed.`,
  },
];

const DEFAULT_REPLY = `Happy to help. Here's how I'd structure it in TypeScript, with the edge cases handled explicitly:

\`\`\`ts
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseAmount(input: string): Result<number> {
  const trimmed = input.trim().replace(/,/g, '');
  if (!/^\\d+(\\.\\d{1,2})?$/.test(trimmed)) {
    return { ok: false, error: 'Enter an amount like 12.50' };
  }
  return { ok: true, value: Math.round(Number(trimmed) * 100) };
}
\`\`\`

Returning a \`Result\` instead of throwing makes the failure path part of the type, so callers can't forget to handle it. Share the code you're working on and I'll tailor this to it.`;

export function cannedReply(prompt: string): string {
  return REPLIES.find((r) => r.match.test(prompt))?.text ?? DEFAULT_REPLY;
}
