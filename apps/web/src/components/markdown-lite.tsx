import { Fragment, type ReactNode } from 'react';
import { CopyButton } from './copy-button';

/**
 * Renders model output as React elements (never HTML): fenced code blocks, paragraphs, bullet and
 * numbered lists, inline `code` and **bold**. Enough for coding answers, with nothing to inject.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    out.push(
      token.startsWith('`') ? (
        <code
          key={`${keyPrefix}-${i++}`}
          className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>
      ) : (
        <strong key={`${keyPrefix}-${i++}`}>{token.slice(2, -2)}</strong>
      ),
    );
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function prose(block: string, key: string): ReactNode {
  const lines = block.split('\n');
  const nodes: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length)
      nodes.push(
        <p key={`${key}-p${nodes.length}`}>{inline(para.join(' '), `${key}-p${nodes.length}`)}</p>,
      );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    nodes.push(
      <Tag
        key={`${key}-l${nodes.length}`}
        className={`${list.ordered ? 'list-decimal' : 'list-disc'} space-y-1 pl-5`}
      >
        {list.items.map((item, i) => (
          <li key={i}>{inline(item, `${key}-li${i}`)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]!);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.replace(/^#{1,6}\s+/, ''));
    }
  }
  flushPara();
  flushList();
  return <Fragment key={key}>{nodes}</Fragment>;
}

export function MarkdownLite({ text, streaming = false }: { text: string; streaming?: boolean }) {
  const parts = text.split(/```/);
  return (
    <div className={`space-y-3 text-[15px] leading-relaxed ${streaming ? 'caret' : ''}`}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return prose(part, `t${i}`);
        const newline = part.indexOf('\n');
        const lang = newline > 0 ? part.slice(0, newline).trim() : '';
        const code = (newline >= 0 ? part.slice(newline + 1) : part).replace(/\n$/, '');
        return (
          <div key={`c${i}`} className="overflow-hidden rounded-lg bg-code-bg text-code-ink">
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-1.5">
              <span className="font-mono text-[11px] text-code-muted">{lang || 'code'}</span>
              <CopyButton text={code} />
            </div>
            <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed">
              <code>{code}</code>
            </pre>
          </div>
        );
      })}
    </div>
  );
}
