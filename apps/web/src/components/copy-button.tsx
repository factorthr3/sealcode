'use client';

import { useState } from 'react';

export function CopyButton({
  text,
  label = 'Copy',
  className = '',
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
      className={`rounded-md border border-white/15 bg-white/5 px-2 py-1 font-sans text-xs text-code-ink hover:bg-white/10 ${className}`}
      aria-live="polite"
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
