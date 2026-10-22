import { expect, test } from 'vitest';
import { timingLine } from './report.ts';

test('the timing line lists sources slowest first, with ok or failed and the error in parentheses', () => {
  const line = timingLine('Muse', 7310, [
    { status: { name: 'MusicBrainz', ok: true, count: 4 }, ms: 1200 },
    { status: { name: 'Google News', ok: false, error: 'HTTP 503 from news.google.com' }, ms: 6900 },
    { status: { name: 'Deezer', ok: true, count: 0 }, ms: 300 },
  ]);
  expect(line).toBe(
    'report "Muse" 7310ms: Google News failed 6900ms (HTTP 503 from news.google.com), MusicBrainz ok 1200ms, Deezer ok 300ms',
  );
});

test('building the timing line does not reorder the caller’s list of sources', () => {
  const sources = [
    { status: { name: 'Deezer', ok: true }, ms: 10 },
    { status: { name: 'Apple Music', ok: true }, ms: 20 },
  ];
  timingLine('Muse', 20, sources);
  expect(sources.map((s) => s.status.name)).toEqual(['Deezer', 'Apple Music']);
});

test('a report with no sources still logs the artist and total time', () => {
  expect(timingLine('Björk', 0, [])).toBe('report "Björk" 0ms: ');
});
