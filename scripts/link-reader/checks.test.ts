// npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFindings, hasUpcoming, isReadable, normalizeUrl } from './checks.ts';
import type { Report, ReleaseFinding, ShowFinding } from '../../shared/types.ts';

const TODAY = '2026-10-19';
const link = (url: string) => ({ label: 'x', url });

test('isReadable skips social and streaming sites, keeps artist pages', () => {
  assert.equal(isReadable(link('https://www.instagram.com/ohdaughter/')), false);
  assert.equal(isReadable(link('https://open.spotify.com/artist/1')), false);
  assert.equal(isReadable(link('https://itunes.apple.com/artist/1')), false);
  assert.equal(isReadable(link('https://twitter.com/ohdaughter')), false);
  assert.equal(isReadable(link('mailto:band@example.com')), false);
  assert.equal(isReadable(link('not a url')), false);
  assert.equal(isReadable(link('http://www.ohdaughter.com/')), true);
  assert.equal(isReadable(link('https://ohdaughter.bandcamp.com/')), true);
  assert.equal(isReadable(link('https://notspotify.com/')), true, 'only whole domains match');
});

test('normalizeUrl treats http/https, www and trailing slashes as the same page', () => {
  assert.equal(normalizeUrl('http://www.ohdaughter.com/'), normalizeUrl('https://ohdaughter.com'));
  assert.equal(normalizeUrl('https://ohdaughter.com/tour/#dates'), normalizeUrl('https://ohdaughter.com/tour'));
  assert.notEqual(normalizeUrl('https://ohdaughter.com/tour'), normalizeUrl('https://ohdaughter.com/news'));
});

const release = (over: Partial<ReleaseFinding> = {}): ReleaseFinding => ({
  title: 'New Song',
  date: '2026-11-07',
  type: 'single',
  source_url: 'https://ohdaughter.com/news',
  quote: 'New single "New Song" out 7 November',
  ...over,
});
const show = (over: Partial<ShowFinding> = {}): ShowFinding => ({
  date: '2026-12-01',
  city: 'Glasgow',
  country: 'UK',
  venue: 'Barrowland',
  source_url: 'https://www.songkick.com/artists/1',
  quote: '1 Dec Barrowland, Glasgow',
  ...over,
});
const FETCHED = ['http://www.ohdaughter.com/news/', 'https://www.songkick.com/artists/1'];

test('checkFindings keeps findings that cite an opened page, quote it and are in the future', () => {
  const r = checkFindings({ releases: [release()], shows: [show()] }, FETCHED, TODAY);
  assert.equal(r.releases.length, 1);
  assert.equal(r.shows.length, 1);
  assert.deepEqual(r.dropped, []);
});

test('checkFindings drops what it cannot verify', () => {
  const r = checkFindings(
    {
      releases: [
        release({ source_url: 'https://ohdaughter.com/made-up' }),
        release({ quote: '  ' }),
        release({ date: '2026-02-30' }),
        release({ date: '2026-10-19' }),
        release({ date: 'soon' }),
      ],
      shows: [show({ date: '2026-12' }), show({ date: '2026-10-01' }), show({ city: '' })],
    },
    FETCHED,
    TODAY,
  );
  assert.equal(r.releases.length + r.shows.length, 0);
  assert.deepEqual(
    r.dropped.map((d) => d.reason),
    [
      "source https://ohdaughter.com/made-up wasn't opened",
      'no quote from the page',
      'invalid date "2026-02-30"',
      "date 2026-10-19 isn't after today",
      'invalid date "soon"',
      'show date "2026-12" needs a day',
      'date 2026-10-01 has passed',
      'no city',
    ],
  );
});

test('checkFindings accepts partial release dates in the future and removes duplicates', () => {
  const r = checkFindings({ releases: [release({ date: '2027' }), release({ date: '2027' })], shows: [show(), show()] }, FETCHED, TODAY);
  assert.equal(r.releases.length, 1);
  assert.equal(r.shows.length, 1);
});

test('hasUpcoming ignores what the link reader itself found', () => {
  const report = (sourceName: string): Report => ({
    artistId: 'a',
    fetchedAt: 0,
    releases: [{ title: 'X', date: '2026-11-01', type: 'single', cover: null, upcoming: true, sources: [{ name: sourceName, url: '' }] }],
    events: [],
    news: [],
    sources: [],
  });
  assert.equal(hasUpcoming(null, TODAY), false);
  assert.equal(hasUpcoming(report('Deezer'), TODAY), true);
  assert.equal(hasUpcoming(report('AI · ohdaughter.com'), TODAY), false);
});
