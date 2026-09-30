/**
 * The log-scan guarantee, applied to the whole gateway suite: after every test file, no log line
 * and nothing written to stdout or stderr may contain fixture prompt text, completion text or key
 * material.
 */
import { afterAll, beforeAll, expect } from 'vitest';
import { capturedLogLines, FORBIDDEN } from './helpers';

const processOutput: string[] = [];
const originals = {
  out: process.stdout.write.bind(process.stdout),
  err: process.stderr.write.bind(process.stderr),
};

beforeAll(() => {
  process.stdout.write = ((chunk: unknown, ...rest: unknown[]) => {
    processOutput.push(String(chunk));
    return (originals.out as (...a: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown, ...rest: unknown[]) => {
    processOutput.push(String(chunk));
    return (originals.err as (...a: unknown[]) => boolean)(chunk, ...rest);
  }) as typeof process.stderr.write;
});

afterAll(() => {
  process.stdout.write = originals.out;
  process.stderr.write = originals.err;
  const haystack = [...capturedLogLines, ...processOutput].join('\n');
  for (const marker of FORBIDDEN) {
    expect(haystack.includes(marker), `"${marker}" leaked into logs or process output`).toBe(false);
  }
});
