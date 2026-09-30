'use client';

import { useFormStatus } from 'react-dom';
import { buttonClass } from './ui';

export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass(variant, size, className)}>
      {pending ? (pendingLabel ?? 'Working…') : children}
    </button>
  );
}

export function FormError({ error }: { error?: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger"
    >
      {error}
    </p>
  );
}
