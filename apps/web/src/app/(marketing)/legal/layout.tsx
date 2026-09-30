import { Callout } from '@/components/ui';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-24">
      <Callout tone="warn" title="Draft">
        This document is a draft pending legal review and will be finalised before general
        availability. Contact us if you need signed terms for a pilot.
      </Callout>
      <article className="prose-docs mt-10 max-w-none">{children}</article>
    </div>
  );
}
