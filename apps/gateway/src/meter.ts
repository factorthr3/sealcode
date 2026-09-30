import {
  fromOpenAIUsage,
  mergeAnthropicUsage,
  ZERO_USAGE,
  type TokenUsage,
} from '@sealcode/shared';

export type WireFormat = 'anthropic' | 'openai';

const EMPTY = new Uint8Array(0);
const EVENT_END = /\r?\n\r?\n/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Relays a response body to the client while reading token usage from it.
 *
 * Content passes through untouched. The only edit is replacing the upstream model ID with the
 * customer's alias in `"model":"…"` fields; inside JSON string content a quote is always escaped,
 * so that pattern cannot match customer text. Events are forwarded as soon as they are complete,
 * so nothing is buffered beyond a partial event.
 */
export class UsageMeter {
  usage: TokenUsage = ZERO_USAGE;
  sawUsage = false;
  private buffer = '';
  private readonly decoder = new TextDecoder();
  private readonly encoder = new TextEncoder();
  private readonly modelPattern: RegExp;
  private readonly aliasField: string;

  constructor(
    private readonly options: {
      format: WireFormat;
      upstreamModel: string;
      alias: string;
      /** Drop the usage-only final chunk the gateway requested on the client's behalf. */
      dropUsageOnlyChunks?: boolean;
    },
  ) {
    this.modelPattern = new RegExp(
      `"model"(\\s*):(\\s*)"${escapeRegExp(options.upstreamModel)}"`,
      'g',
    );
    this.aliasField = JSON.stringify(options.alias);
  }

  /** Rewrite the model name in a whole (non-streamed) body. */
  rewrite(text: string): string {
    return text.includes(this.options.upstreamModel)
      ? text.replace(this.modelPattern, `"model"$1:$2${this.aliasField}`)
      : text;
  }

  /** Read usage from a whole (non-streamed) JSON body. */
  readJson(text: string): void {
    try {
      const body = JSON.parse(text) as { usage?: unknown };
      this.applyUsage(body);
    } catch {
      // Not JSON: nothing to meter.
    }
  }

  push(chunk: Uint8Array): Uint8Array {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    let out = '';
    let match: RegExpExecArray | null;
    while ((match = EVENT_END.exec(this.buffer))) {
      const end = match.index + match[0].length;
      out += this.processEvent(this.buffer.slice(0, end));
      this.buffer = this.buffer.slice(end);
    }
    return out ? this.encoder.encode(out) : EMPTY;
  }

  flush(): Uint8Array {
    const rest = this.buffer + this.decoder.decode();
    this.buffer = '';
    return rest ? this.encoder.encode(this.processEvent(rest)) : EMPTY;
  }

  private processEvent(block: string): string {
    const text = this.rewrite(block);
    if (!text.includes('"usage"')) return text;
    const data = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    try {
      const payload = JSON.parse(data) as Record<string, unknown>;
      this.applyUsage(payload);
      if (
        this.options.format === 'openai' &&
        this.options.dropUsageOnlyChunks &&
        Array.isArray(payload.choices) &&
        payload.choices.length === 0
      ) {
        return '';
      }
    } catch {
      // Not a JSON payload (for example `[DONE]`): pass through.
    }
    return text;
  }

  private applyUsage(payload: Record<string, unknown>): void {
    if (this.options.format === 'anthropic') {
      // `message_start` nests usage in `message`; `message_delta` and whole messages carry it
      // at the top level.
      const message = payload.message as { usage?: unknown } | undefined;
      const usage = payload.usage ?? message?.usage;
      if (usage) {
        this.usage = mergeAnthropicUsage(this.usage, usage);
        this.sawUsage = true;
      }
    } else {
      const usage = fromOpenAIUsage(payload.usage);
      if (usage) {
        this.usage = usage;
        this.sawUsage = true;
      }
    }
  }
}
