import { test, expect } from 'vitest';
import { WINDOWS, windowEnd, parseWindow } from './concerts.ts';

// new Date(y, m, d) is local midnight, months start at 0. Avoid new Date('2026-10-20'):
// that's UTC midnight, which is still Oct 19 in the Americas.
const TODAY = new Date(2026, 9, 20);

test('"Any time" has no end', () => {
    expect(windowEnd(WINDOWS[0], TODAY)).toBeNull();
});

test('day windows count days', () => {
    expect(windowEnd(WINDOWS[1], TODAY)).toBe('2026-11-10');
    expect(windowEnd(WINDOWS[2], TODAY)).toBe('2026-12-01');
});

test('month windows cross into the next year', () => {
    expect(windowEnd(WINDOWS[3], TODAY)).toBe('2027-01-20');
    expect(windowEnd(WINDOWS[4], TODAY)).toBe('2027-04-20');
});

test('does not change the date passed in', () => {
    const today = new Date(2026, 9, 20);
    windowEnd(WINDOWS[3], today);
    expect(today.getMonth()).toBe(9);
});

test('1 month from Jan 31 overflows Feb 31 into March', () => {
    const oneMonth = { label: '1 month', days: 0, months: 1 };
    expect(windowEnd(oneMonth, new Date(2027, 0, 31))).toBe('2027-03-03');
});

test('a typed count of days becomes that many days', () => {
    expect(parseWindow('2 days')).toEqual({ label: '2 days', days: 2, months: 0 });
    expect(parseWindow('1 day')).toEqual({ label: '1 day', days: 1, months: 0 });
});

test('weeks become seven days each', () => {
    expect(parseWindow('3 weeks')).toEqual({ label: '3 weeks', days: 21, months: 0 });
    expect(parseWindow('next week')).toEqual({ label: 'next week', days: 7, months: 0 });
    expect(parseWindow('one week')).toEqual({ label: 'one week', days: 7, months: 0 });
});

test('months stay months rather than being turned into days', () => {
    expect(parseWindow('a month')).toEqual({ label: 'a month', days: 0, months: 1 });
    expect(parseWindow('3 months')).toEqual({ label: '3 months', days: 0, months: 3 });
});

test('a typed window ignores case and surrounding spaces, and keeps the trimmed text as its label', () => {
    expect(parseWindow('  Next Week  ')).toEqual({ label: 'Next Week', days: 7, months: 0 });
    expect(parseWindow('2 MONTHS')).toEqual({ label: '2 MONTHS', days: 0, months: 2 });
});

test('text that is not a time window gives null', () => {
    expect(parseWindow('')).toBeNull();
    expect(parseWindow('   ')).toBeNull();
    expect(parseWindow('soon')).toBeNull();
    expect(parseWindow('2 years')).toBeNull();
    expect(parseWindow('two days')).toBeNull();
    expect(parseWindow('-2 days')).toBeNull();
});

test('a zero-length window gives null instead of meaning "any time"', () => {
    expect(parseWindow('0 days')).toBeNull();
    expect(parseWindow('0 months')).toBeNull();
});

test('a typed window fed into windowEnd gives the right end date', () => {
    expect(windowEnd(parseWindow('2 days')!, TODAY)).toBe('2026-10-22');
    expect(windowEnd(parseWindow('next week')!, TODAY)).toBe('2026-10-27');
    expect(windowEnd(parseWindow('a month')!, TODAY)).toBe('2026-11-20');
    expect(windowEnd(parseWindow('3 months')!, TODAY)).toBe('2027-01-20');
});
