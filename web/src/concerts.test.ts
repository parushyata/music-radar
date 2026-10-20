import { test, expect } from 'vitest';
import { WINDOWS, windowEnd, parseWindow, windowHint, WINDOW_HELP } from './concerts.ts';

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

test('the window hint is the plain help text while the box is empty or holds a valid window', () => {
    expect(windowHint('')).toBe(WINDOW_HELP);
    expect(windowHint('   ')).toBe(WINDOW_HELP);
    expect(windowHint('10 days')).toBe(WINDOW_HELP);
    expect(windowHint('  Next Week  ')).toBe(WINDOW_HELP);
    expect(windowHint('3 months')).toBe(WINDOW_HELP);
});

test('a window typed in years gets a hint with the same span in months', () => {
    const tryMonths = (n: number) => `Years aren't supported. Try ${n} months.`;
    expect(windowHint('next year')).toBe(tryMonths(12));
    expect(windowHint('a year')).toBe(tryMonths(12));
    expect(windowHint('one year')).toBe(tryMonths(12));
    expect(windowHint('2 years')).toBe(tryMonths(24));
    expect(windowHint('in 2 years')).toBe(tryMonths(24));
    expect(windowHint('  2 YEARS  ')).toBe(tryMonths(24));
});

test('zero years is not turned into "Try 0 months" but reported as unreadable', () => {
    expect(windowHint('0 years')).toBe(`Couldn't read "0 years". ${WINDOW_HELP}`);
});

test('unreadable text is quoted back trimmed, followed by the help text', () => {
    expect(windowHint('  soon  ')).toBe(`Couldn't read "soon". ${WINDOW_HELP}`);
    expect(windowHint('two days')).toBe(`Couldn't read "two days". ${WINDOW_HELP}`);
    expect(windowHint('0 days')).toBe(`Couldn't read "0 days". ${WINDOW_HELP}`);
});

test('a year hint needs exactly one count, and accepts "in a year"', () => {
    expect(windowHint('in a year')).toBe("Years aren't supported. Try 12 months.");
    for (const text of ['years', 'year', 'in years', '1 2 years', 'a 3 years']) {
        expect(windowHint(text)).toBe(`Couldn't read "${text}". ${WINDOW_HELP}`);
    }
});
