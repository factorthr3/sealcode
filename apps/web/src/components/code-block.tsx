import { CopyButton } from './copy-button';

export function CodeBlock({
  code,
  label,
  copy = true,
}: {
  code: string;
  label?: string;
  copy?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-black/10 bg-code-bg text-code-ink">
      {label || copy ? (
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
          <span className="font-mono text-xs text-code-muted">{label ?? ''}</span>
          {copy ? <CopyButton text={code} /> : null}
        </div>
      ) : null}
      <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
