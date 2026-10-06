import { daysFromToday } from './dates.ts';
import type { Release, Report, ShowEvent } from '../../../shared/types.ts';

export const isAlbumish = (r: Release) => r.type === 'album' || r.type === 'ep';

export interface Summary {
  upcoming: Release[];
  latestAlbum: Release | null;
  /** A single newer than the latest album, released in the last ~4 months. */
  newSingle: Release | null;
  /** Upcoming shows, excluding ones the ticketing source marks as cancelled. */
  shows: ShowEvent[];
  nextShow: ShowEvent | null;
}

export function summarize(report: Report): Summary {
  const upcoming = report.releases.filter((r) => r.upcoming).sort((a, b) => a.date.localeCompare(b.date));
  const past = report.releases.filter((r) => !r.upcoming && r.date);
  const latestAlbum = past.find(isAlbumish) ?? past.find((r) => r.type !== 'single') ?? null;
  const latestSingle = past.find((r) => r.type === 'single');
  const newSingle =
    latestSingle && (!latestAlbum || latestSingle.date > latestAlbum.date) && daysFromToday(latestSingle.date) > -120
      ? latestSingle
      : null;
  const shows = report.events.filter((e) => e.status !== 'cancelled');
  return { upcoming, latestAlbum, newSingle, shows, nextShow: shows[0] ?? null };
}

export const place = (e: ShowEvent) =>
  [e.city, e.region && e.region !== e.country ? e.region : '', e.country].filter(Boolean).join(', ');
