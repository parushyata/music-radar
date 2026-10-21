import type { Page } from '@playwright/test';
import type { ArtistWithReport, ConfigStatus, Me, ShowEvent } from '../shared/types.ts';

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

interface Options {
  signedIn?: boolean;
  artists?: ArtistWithReport[];
  config?: ConfigStatus;
}

/** Fixes the clock and answers /api/* from fixtures instead of the real worker. */
export async function mockApi(page: Page, { signedIn = true, artists = ARTISTS, config = { ticketmaster: true, bandsintown: false } }: Options = {}) {
  await page.clock.setFixedTime(TODAY);
  await page.route('**/api/**', (route) => {
    if (!signedIn) return route.fulfill({ status: 401, json: { error: 'Not signed in' } });
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') return route.fulfill({ json: ME });
    if (path === '/api/config') return route.fulfill({ json: config });
    if (path === '/api/artists') return route.fulfill({ json: artists });
    return route.fulfill({ status: 404, json: { error: `No mock for ${path}` } });
  });
}
