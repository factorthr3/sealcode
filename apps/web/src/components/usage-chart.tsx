'use client';

import { useId, useMemo, useState } from 'react';

export interface DailyPoint {
  day: string;
  values: Record<string, number>;
}

export interface Series {
  key: string;
  label: string;
}

/**
 * Daily tokens as stacked bars, one colour per model alias. Colours follow the entity in a fixed
 * order and were validated for colour-vision deficiency in both themes. The legend, per-column
 * tooltip and the data table below mean identity never relies on colour alone.
 */
const SERIES_COLORS = ['var(--viz-series-1)', 'var(--viz-series-2)'];

const compact = new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('en-GB');

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 4)! * magnitude;
  return Math.ceil(value / step) * step;
}

export function UsageChart({
  data,
  series,
  title,
}: {
  data: DailyPoint[];
  series: Series[];
  title: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const width = 720;
  const height = 240;
  const pad = { top: 12, right: 8, bottom: 26, left: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const totals = useMemo(
    () => data.map((d) => series.reduce((n, s) => n + (d.values[s.key] ?? 0), 0)),
    [data, series],
  );
  const max = niceMax(Math.max(0, ...totals));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const slot = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(22, slot * 0.62));
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <figure className="viz-root" aria-labelledby={`${id}-title`}>
      <figcaption id={`${id}-title`} className="sr-only">
        {title}
      </figcaption>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-ink-2" aria-hidden>
        {series.map((s, i) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-sm"
              style={{ background: SERIES_COLORS[i] }}
            />
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={title}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--line)"
                strokeWidth={t === 0 ? 1 : 0.75}
              />
              <text
                x={pad.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                fontSize="11"
                fill="var(--muted)"
              >
                {compact.format(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.left + slot * i + slot / 2;
            let base = 0;
            const present = series.filter((s) => (d.values[s.key] ?? 0) > 0);
            return (
              <g key={d.day} opacity={hover === null || hover === i ? 1 : 0.45}>
                {present.map((s, j) => {
                  const v = d.values[s.key] ?? 0;
                  const top = y(base + v);
                  const bottom = y(base);
                  base += v;
                  const isTop = j === present.length - 1;
                  // 2px surface gap between stacked segments; 4px rounded data-end on the top one.
                  const h = Math.max(0, bottom - top - (j > 0 ? 2 : 0));
                  const r = isTop ? Math.min(4, h / 2, barW / 2) : 0;
                  const x = cx - barW / 2;
                  const yTop = top;
                  const path = r
                    ? `M${x},${yTop + h}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + barW - r}Q${x + barW},${yTop} ${x + barW},${yTop + r}V${yTop + h}Z`
                    : `M${x},${yTop + h}V${yTop}H${x + barW}V${yTop + h}Z`;
                  return <path key={s.key} d={path} fill={SERIES_COLORS[series.indexOf(s)]} />;
                })}
                {i % labelEvery === 0 ? (
                  <text x={cx} y={height - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">
                    {Number(d.day.slice(8))}
                  </text>
                ) : null}
                {/* Hit target: the whole column, wider than the bar. */}
                <rect
                  x={pad.left + slot * i}
                  y={pad.top}
                  width={slot}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${d.day}: ${full.format(totals[i] ?? 0)} tokens`}
                />
              </g>
            );
          })}
        </svg>
        {hover !== null && data[hover] ? (
          <div
            className="pointer-events-none absolute top-0 z-10 w-48 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-xs shadow-lg"
            style={{ left: `${((pad.left + slot * hover + slot / 2) / width) * 100}%` }}
            role="status"
          >
            <p className="font-medium text-ink">{data[hover]!.day}</p>
            {series.map((s, i) => (
              <p key={s.key} className="mt-1 flex items-center justify-between gap-2 text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-sm"
                    style={{ background: SERIES_COLORS[i] }}
                  />
                  {s.label}
                </span>
                <span className="tabular-nums text-ink">
                  {full.format(data[hover]!.values[s.key] ?? 0)}
                </span>
              </p>
            ))}
            <p className="mt-1.5 flex justify-between border-t border-line pt-1.5 text-ink">
              <span>Total</span>
              <span className="tabular-nums">{full.format(totals[hover] ?? 0)}</span>
            </p>
          </div>
        ) : null}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs text-muted">Show as table</summary>
        <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                {series.map((s) => (
                  <th key={s.key} className="px-3 py-2 text-right font-medium">
                    {s.label}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, i) => (
                <tr key={d.day} className="border-t border-line">
                  <td className="px-3 py-1.5">{d.day}</td>
                  {series.map((s) => (
                    <td key={s.key} className="px-3 py-1.5 text-right tabular-nums">
                      {full.format(d.values[s.key] ?? 0)}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {full.format(totals[i] ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
