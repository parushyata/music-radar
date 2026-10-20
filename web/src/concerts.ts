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
