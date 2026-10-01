/** A rosette like a pressed wax seal: 18 lobes, alternating radii. */
const SEAL_PATH = (() => {
  const points: string[] = [];
  const lobes = 18;
  for (let i = 0; i < lobes * 2; i++) {
    const r = i % 2 === 0 ? 15 : 13.3;
    const a = (Math.PI * i) / lobes - Math.PI / 2;
    points.push(`${(16 + r * Math.cos(a)).toFixed(2)} ${(16 + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${points.join('L')}Z`;
})();

/** The Sealcode mark: a wax seal with a pair of brackets pressed into it. */
export function SealMark({ className = 'size-[2.45rem]' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d={SEAL_PATH} fill="var(--seal)" strokeLinejoin="round" />
      <circle
        cx="16"
        cy="16"
        r="9.6"
        fill="none"
        stroke="var(--paper)"
        strokeOpacity=".5"
        strokeWidth="1"
      />
      <path
        d="M13.2 12l-3.4 4 3.4 4M18.8 12l3.4 4-3.4 4"
        fill="none"
        stroke="var(--paper)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.7rem] ${className}`}>
      <SealMark />
      <span className="font-display text-[2.31rem] leading-none tracking-tight">Sealcode</span>
    </span>
  );
}
