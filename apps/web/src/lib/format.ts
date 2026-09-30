const dateFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});
const intFmt = new Intl.NumberFormat('en-GB');

export const formatDate = (d: Date | string | null | undefined) =>
  d ? dateFmt.format(new Date(d)) : '—';
export const formatDateTime = (d: Date | string | null | undefined) =>
  d ? `${dateTimeFmt.format(new Date(d))} UTC` : '—';
export const formatInt = (n: number) => intFmt.format(n);

export function relativeTime(d: Date | string | null | undefined, now = Date.now()): string {
  if (!d) return 'never';
  const seconds = Math.round((now - new Date(d).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : formatDate(d);
}

export function daysLeft(until: Date | null | undefined, now = Date.now()): number {
  return until ? Math.max(0, Math.ceil((new Date(until).getTime() - now) / 86_400_000)) : 0;
}

export function currentPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}
