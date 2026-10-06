export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Today in the viewer's timezone, as YYYY-MM-DD. */
export const todayStr = () => new Date().toLocaleDateString('en-CA');

/** Parse YYYY, YYYY-MM or YYYY-MM-DD as a UTC date (missing parts default to the 1st). */
export function parseDate(d: string): Date {
  const [y, m = 1, day = 1] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export const isFullDate = (d: string) => d.length === 10;

export function fmtDate(d: string): string {
  if (!d) return 'date TBA';
  const [y, m, day] = d.split('-');
  if (!m) return y;
  if (!day) return `${MONTHS[+m - 1]} ${y}`;
  return `${MONTHS[+m - 1]} ${+day}, ${y}`;
}

export const daysFromToday = (d: string) => Math.round((parseDate(d).getTime() - parseDate(todayStr()).getTime()) / 86_400_000);

/** "in 3 days", "2 weeks ago", … — empty for partial dates. */
export function relDays(d: string): string {
  if (!isFullDate(d)) return '';
  const diff = daysFromToday(d);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  const abs = Math.abs(diff);
  const [n, unit] =
    abs < 14 ? [abs, 'day'] : abs < 60 ? [Math.round(abs / 7), 'week'] : abs < 730 ? [Math.round(abs / 30.4), 'month'] : [Math.round(abs / 365), 'year'];
  const txt = `${n} ${unit}${n === 1 ? '' : 's'}`;
  return diff > 0 ? `in ${txt}` : `${txt} ago`;
}

export function relMinutes(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}
