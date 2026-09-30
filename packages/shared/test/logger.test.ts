import { describe, expect, it } from 'vitest';
import { createLogger, errorFields } from '../src/logger';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({ component: 'test', sink: (l) => lines.push(JSON.parse(l)) });
  return { lines, logger };
}

describe('allowlist logger', () => {
  it('keeps allowlisted metadata', () => {
    const { lines, logger } = capture();
    logger.info('request.completed', {
      request_id: 'req_abc',
      status: 200,
      input_tokens: 12,
      stream: true,
    });
    expect(lines[0]).toMatchObject({
      event: 'request.completed',
      component: 'test',
      request_id: 'req_abc',
      status: 200,
    });
  });

  it('drops fields that are not on the allowlist', () => {
    const { lines, logger } = capture();
    logger.info('x', { prompt: 'secret code', body: '{}' } as never);
    expect(JSON.stringify(lines)).not.toContain('secret code');
    expect(lines[0]).toMatchObject({ dropped_fields: 2 });
  });

  it('redacts identifier fields that look like prose', () => {
    const { lines, logger } = capture();
    logger.info('x', { model: 'please refactor my payment service', status: 'two' as never });
    expect(lines[0]).toMatchObject({ model: '[redacted]', status: '[redacted]' });
  });

  it('refuses free-text event names', () => {
    const { lines, logger } = capture();
    logger.error('user said: here is my private key');
    expect(lines[0]).toMatchObject({ event: 'invalid_event' });
  });

  it('reduces errors to name and code', () => {
    let err: unknown;
    try {
      JSON.parse('{"prompt": "top secret');
    } catch (e) {
      err = e;
    }
    const { lines, logger } = capture();
    logger.error('upstream.failed', errorFields(err));
    expect(JSON.stringify(lines)).not.toContain('top secret');
    expect(lines[0]).toMatchObject({ error_name: 'SyntaxError' });
  });
});
