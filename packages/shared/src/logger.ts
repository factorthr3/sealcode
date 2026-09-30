/**
 * The only logger Sealcode services use. It accepts an allowlist of metadata fields and nothing
 * else, so request or response content cannot reach a log line by accident:
 *
 * - Unknown fields are dropped (and counted in `dropped_fields`).
 * - Event names must be short machine identifiers: no spaces, so no sentences, so no prompts.
 * - String values must match a strict identifier pattern (no whitespace, bounded length);
 *   anything else is replaced with "[redacted]".
 * - Errors are reduced to `name` and `code`. Messages are never logged, because parser errors
 *   quote the input they failed on.
 */

type FieldKind = 'id' | 'number' | 'boolean';

export const LOG_FIELDS = {
  component: 'id',
  request_id: 'id',
  org_id: 'id',
  user_id: 'id',
  key_id: 'id',
  key_prefix: 'id',
  receipt_id: 'id',
  session_id: 'id',
  model: 'id',
  upstream_model: 'id',
  route: 'id',
  method: 'id',
  refusal: 'id',
  error_type: 'id',
  error_name: 'id',
  error_code: 'id',
  job: 'id',
  kind: 'id',
  plan: 'id',
  env: 'id',
  status: 'number',
  latency_ms: 'number',
  ttfb_ms: 'number',
  upstream_ms: 'number',
  input_tokens: 'number',
  output_tokens: 'number',
  cache_read_tokens: 'number',
  cache_write_tokens: 'number',
  threshold: 'number',
  port: 'number',
  count: 'number',
  attempt: 'number',
  duration_ms: 'number',
  bytes: 'number',
  stream: 'boolean',
  aborted: 'boolean',
  playground: 'boolean',
} as const satisfies Record<string, FieldKind>;

export type LogField = keyof typeof LOG_FIELDS;
export type LogFields = Partial<Record<LogField, string | number | boolean | null | undefined>>;
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const EVENT_PATTERN = /^[a-z][a-z0-9_.:-]{0,79}$/;
const ID_PATTERN = /^[A-Za-z0-9_.:/@+=-]{1,160}$/;
const REDACTED = '[redacted]';

export type LogSink = (line: string) => void;

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

function sanitize(fields: LogFields | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!fields) return out;
  let dropped = 0;
  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    const kind: FieldKind | undefined = (LOG_FIELDS as Record<string, FieldKind>)[name];
    if (!kind) {
      dropped++;
      continue;
    }
    if (kind === 'number') {
      out[name] = typeof value === 'number' && Number.isFinite(value) ? value : REDACTED;
    } else if (kind === 'boolean') {
      out[name] = typeof value === 'boolean' ? value : REDACTED;
    } else {
      out[name] = typeof value === 'string' && ID_PATTERN.test(value) ? value : REDACTED;
    }
  }
  if (dropped > 0) out.dropped_fields = dropped;
  return out;
}

const defaultSink: LogSink = (line) => {
  process.stdout.write(`${line}\n`);
};

export function createLogger(options: {
  component: string;
  level?: LogLevel;
  sink?: LogSink;
  base?: LogFields;
}): Logger {
  const minimum = LEVEL_ORDER[options.level ?? 'info'];
  const sink = options.sink ?? defaultSink;
  const base = sanitize({ component: options.component, ...options.base });

  const write = (level: LogLevel, event: string, fields?: LogFields) => {
    if (LEVEL_ORDER[level] < minimum) return;
    const line = {
      ts: new Date().toISOString(),
      level,
      event: EVENT_PATTERN.test(event) ? event : 'invalid_event',
      ...base,
      ...sanitize(fields),
    };
    sink(JSON.stringify(line));
  };

  return {
    debug: (e, f) => write('debug', e, f),
    info: (e, f) => write('info', e, f),
    warn: (e, f) => write('warn', e, f),
    error: (e, f) => write('error', e, f),
    child: (fields) =>
      createLogger({ ...options, base: { ...options.base, ...(fields as LogFields) } }),
  };
}

/** The only safe way to log an error: its class name and code, never its message or stack. */
export function errorFields(err: unknown): LogFields {
  if (err && typeof err === 'object') {
    const e = err as { name?: unknown; code?: unknown };
    return {
      error_name: typeof e.name === 'string' ? e.name : 'Error',
      error_code: typeof e.code === 'string' || typeof e.code === 'number' ? String(e.code) : null,
    };
  }
  return { error_name: typeof err };
}

export function parseLogLevel(value: string | undefined): LogLevel {
  return value === 'debug' || value === 'warn' || value === 'error' ? value : 'info';
}

/**
 * Replace `console.*` so third-party code cannot print request content. Each call is reduced to
 * a `console.suppressed` event with no arguments. Call once at process start in production.
 */
export function silenceConsole(logger: Logger): void {
  const suppressed = (level: LogLevel) => () => logger[level]('console.suppressed');
  /* eslint-disable no-console -- the one place console is touched: to disable it */
  console.log = suppressed('info');
  console.info = suppressed('info');
  console.debug = suppressed('debug');
  console.warn = suppressed('warn');
  console.error = suppressed('error');
  console.trace = suppressed('error');
  /* eslint-enable no-console */
}
