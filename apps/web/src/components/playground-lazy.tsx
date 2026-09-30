'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';

const Playground = dynamic(() => import('./playground').then((m) => m.Playground), {
  ssr: false,
  loading: () => <PlaygroundShell />,
});

function PlaygroundShell() {
  return (
    <div className="flex h-[36rem] items-center justify-center rounded-2xl border border-line bg-surface text-sm text-muted">
      Loading the playground…
    </div>
  );
}

/** Loads the playground's code only as it approaches the viewport, keeping the first load light. */
export function PlaygroundLazy() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (location.hash === '#playground') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref}>{visible ? <Playground /> : <PlaygroundShell />}</div>;
}
