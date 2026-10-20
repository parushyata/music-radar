export const WINDOWS = [
    { label: 'Any time', days: 0, months: 0 },
    { label: '3 weeks', days: 21, months: 0 },
    { label: '6 weeks', days: 42, months: 0 },
    { label: '3 months', days: 0, months: 3 },
    { label: '6 months', days: 0, months: 6 },
];

// Takes `today` so tests get a fixed answer; copies it so the caller's date isn't changed.
export function windowEnd({ days, months }: (typeof WINDOWS)[number], today: Date): string | null {
    if (!days && !months) return null;
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('en-CA'); // en-CA formats as 2026-12-01
}

// Reads a typed window like "2 days", "next week" or "3 months". Returns null when it can't.
export function parseWindow(text: string): (typeof WINDOWS)[number] | null {
    const m = text.trim().toLowerCase().match(/^(\d+|an?|one|next)?\s*(day|week|month)s?$/);
    if (!m) return null;
    const count = m[1] && /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
    if (!count) return null;
    const label = text.trim();
    if (m[2] === 'month') return { label, days: 0, months: count };
    return { label, days: m[2] === 'week' ? count * 7 : count, months: 0 };
}

export const WINDOW_HELP = 'A number and days, weeks or months, e.g. 10 days or next week. Years aren\'t supported.';

// Tooltip for the typed window: says what went wrong when parseWindow can't read it.
export function windowHint(text: string): string {
    if (!text.trim() || parseWindow(text)) return WINDOW_HELP;
    const y = text.trim().toLowerCase().match(/^(?:in\s+)?(\d+|an?|one|next)\s*years?$/);
    const years = y && (/^\d+$/.test(y[1]) ? Number(y[1]) : 1);
    if (years) return `Years aren't supported. Try ${years * 12} months.`;
    return `Couldn't read "${text.trim()}". ${WINDOW_HELP}`;
}
