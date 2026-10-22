import type { Page } from '@playwright/test';
import type { ArtistCandidate, ArtistWithReport, ConfigStatus, Me, Report, ShowEvent } from '../shared/types.ts';

// Every test runs on this day, so "2 days" or "next week" always mean the same dates.
export const TODAY = new Date('2026-10-20T12:00:00Z');

export const ME: Me = { email: 'tester@example.com', name: 'Tester', picture: null };

const show = (date: string, city: string, country: string, venue: string): ShowEvent => ({
  date, time: '20:00', title: '', venue, city, region: '', country, status: 'onsale',
  sources: [{ name: 'Ticketmaster', url: 'https://example.com/tickets' }],
});

export const ARTISTS: ArtistWithReport[] = [
  {
    id: 'a1', mbid: 'mbid-1', name: 'Test Band', disambiguation: 'test fixture', country: 'GB', type: 'Group',
    deezerId: null, itunesId: null, image: null, links: [], addedAt: '2026-01-01T00:00:00Z',
    report: {
      artistId: 'a1', fetchedAt: TODAY.getTime(), releases: [], news: [], sources: [],
      events: [
        show('2026-10-21', 'Berlin', 'DE', 'Columbiahalle'),
        show('2026-10-25', 'London', 'GB', 'Roundhouse'),
        show('2026-11-30', 'Paris', 'FR', 'Olympia'),
        show('2027-03-10', 'Tokyo', 'JP', 'Zepp Haneda'),
      ],
    },
  },
];

/** What GET /api/search answers, whatever the query. */
export const CANDIDATES: ArtistCandidate[] = [
  { mbid: 'mbid-new', name: 'New Band', disambiguation: 'search fixture', country: 'IS', type: 'Group', score: 100, aliases: [], tags: ['indie'] },
];

interface Options {
  signedIn?: boolean;
  artists?: ArtistWithReport[];
  config?: ConfigStatus;
  candidates?: ArtistCandidate[];
  /** Keep POST /api/artists/:id/refresh open until the test calls `releaseRefresh()`. */
  holdRefresh?: boolean;
}

/**
 * Fixes the clock and answers /api/* from fixtures instead of the real worker. Adding an artist
 * (search pick or manual) puts it in this page's list without a report; refreshing gives it one.
 */
export async function mockApi(
  page: Page,
  { signedIn = true, artists = ARTISTS, config = { ticketmaster: true, bandsintown: false }, candidates = CANDIDATES, holdRefresh = false }: Options = {},
) {
  const list = structuredClone(artists);
  let releaseRefresh = () => {};
  const refreshGate = holdRefresh ? new Promise<void>((resolve) => (releaseRefresh = resolve)) : Promise.resolve();

  await page.clock.setFixedTime(TODAY);
  await page.route('**/api/**', async (route) => {
    if (!signedIn) return route.fulfill({ status: 401, json: { error: 'Not signed in' } });
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const post = req.method() === 'POST';
    if (path === '/api/me') return route.fulfill({ json: ME });
    if (path === '/api/config') return route.fulfill({ json: config });
    if (path === '/api/search') return route.fulfill({ json: candidates });
    if (path === '/api/artists' && post) {
      const { mbid } = req.postDataJSON() as { mbid: string };
      const known = list.find((a) => a.mbid === mbid);
      if (known) return route.fulfill({ json: { artist: known, existed: true } });
      const c = candidates.find((x) => x.mbid === mbid)!;
      const artist = {
        id: `id-${mbid}`, mbid, name: c.name, disambiguation: c.disambiguation, country: c.country, type: c.type,
        deezerId: null, itunesId: null, image: null, links: [], addedAt: TODAY.toISOString(),
      };
      list.push({ ...artist, report: null });
      return route.fulfill({ json: { artist, existed: false } });
    }
    if (path === '/api/artists') return route.fulfill({ json: list });
    if (path === '/api/manual-artists' && post) {
      const input = req.postDataJSON() as { name: string; disambiguation?: string };
      const artist = {
        id: `manual-${list.length}`, mbid: null, name: input.name, disambiguation: input.disambiguation ?? '', country: '', type: '',
        deezerId: 1, itunesId: null, image: null, links: [], addedAt: TODAY.toISOString(),
      };
      list.push({ ...artist, report: null });
      return route.fulfill({ json: { artist, existed: false } });
    }
    const refresh = path.match(/^\/api\/artists\/([^/]+)\/refresh$/);
    if (refresh && post) {
      await refreshGate;
      const report: Report = { artistId: refresh[1], fetchedAt: TODAY.getTime(), releases: [], events: [], news: [], sources: [] };
      const a = list.find((x) => x.id === refresh[1]);
      if (a) a.report = report;
      return route.fulfill({ json: report });
    }
    return route.fulfill({ status: 404, json: { error: `No mock for ${path}` } });
  });
  return { releaseRefresh: () => releaseRefresh() };
}
