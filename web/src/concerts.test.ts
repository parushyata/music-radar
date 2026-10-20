import { test, expect } from 'vitest';
import { WINDOWS, windowEnd } from './concerts.ts';

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
