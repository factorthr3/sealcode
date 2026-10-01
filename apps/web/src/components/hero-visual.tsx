import type { CSSProperties } from 'react';

const LINES: { text: string; tone?: 'prompt' | 'ok' | 'dim' | 'tool'; gap?: boolean }[] = [
  { text: '~/payments-api $ npx sealcode login', tone: 'prompt' },
  { text: '  code BCDF-GHJK · approved in your browser', tone: 'dim' },
  { text: '✓ Signed in as priya@example.com (Example Fintech)', tone: 'ok' },
  { text: '✓ Claude Code now uses api.sealcode.ai', tone: 'ok' },
  { text: '~/payments-api $ claude', tone: 'prompt', gap: true },
  { text: '> Fix the rounding bug in settlement.ts and run the tests' },
  { text: '⏺ Read(src/settlement.ts)', tone: 'tool' },
  { text: '⏺ Update(src/settlement.ts)  +4 −2', tone: 'tool' },
  { text: '⏺ Bash(npm test)  ✓ 128 passed', tone: 'tool' },
];

const TONE = {
  prompt: 'text-code-ink',
  ok: 'text-[#5fd08a]',
  dim: 'text-code-muted',
  tool: 'text-[#8ab4ff]',
} as const;

const delay = (i: number): CSSProperties => ({ animationDelay: `${0.25 + i * 0.32}s` });

/** Illustrative session: what a developer sees after one command. */
export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-xl pb-24 sm:pb-16" aria-hidden>
      <div className="overflow-hidden rounded-2xl border border-black/20 bg-code-bg shadow-[0_40px_90px_-35px_rgba(14,23,38,0.6)]">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="ml-3 font-mono text-[11px] text-code-muted">zsh: payments-api</span>
        </div>
        <div className="space-y-1 px-4 py-4 font-mono text-[12px] leading-relaxed sm:text-[12.5px]">
          {LINES.map((l, i) => (
            <p
              key={i}
              className={`rise ${l.gap ? 'pt-3' : ''} ${l.tone ? TONE[l.tone] : 'text-code-ink'} whitespace-pre-wrap`}
              style={delay(i)}
            >
              {l.text}
            </p>
          ))}
          <p className="rise text-code-ink caret" style={delay(LINES.length)}>
            {' '}
          </p>
        </div>
      </div>

      <div
        className="rise receipt-edge absolute -bottom-2 right-2 w-[17rem] rotate-[-3deg] rounded-t-lg border border-line bg-surface px-4 pt-3 font-mono text-[11px] text-ink-2 shadow-[0_25px_60px_-25px_rgba(14,23,38,0.55)] sm:-right-6 sm:w-72"
        style={delay(LINES.length + 1)}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold tracking-[0.18em] text-ink">RECEIPT</span>
          <span className="text-muted">rcpt-e0ee…951f</span>
        </div>
        <dl className="mt-2 space-y-0.5 border-t border-dashed border-line-strong pt-2">
          <div className="flex justify-between gap-2">
            <dt>model</dt>
            <dd className="text-ink">sealcode-pro</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>enclave</dt>
            <dd className="text-ink">Intel TDX · GPU TEE</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>upstream</dt>
            <dd className="text-verified">✓ verified · required</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>stored</dt>
            <dd className="text-ink">metadata only</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
