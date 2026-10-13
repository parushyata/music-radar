// Queries every source for one artist, merges duplicates and caches the result in D1.
import { reportsRepo, type ReportTable } from './db.ts';
import { norm, today } from './lib/text.ts';
import { recentReleases } from './sources/musicbrainz.ts';
import { deezerReleases } from './sources/deezer.ts';
import { itunesReleases } from './sources/itunes.ts';
import { ticketmasterEvents } from './sources/ticketmaster.ts';
import { bandsintownEvents } from './sources/bandsintown.ts';
import { newsFor } from './sources/news.ts';
import type { Env } from './env.ts';
import type { FollowedArtist, NewsItem, Release, Report, ShowEvent, SourceStatus } from '../shared/types.ts';
import type { RawEvent, RawRelease } from './sources/types.ts';

const EDITION_RE = /\s*[(\[][^)\]]*\b(deluxe|edition|remaster(ed)?|expanded|anniversary|explicit|clean|bonus)\b[^)\]]*[)\]]/gi;
const releaseKey = (title: string) => norm(title.replace(EDITION_RE, '').replace(/\s+-\s+(EP|Single)$/i, ''));

export function mergeReleases(raw: RawRelease[]): Release[] {
  const byKey = new Map<string, Omit<Release, 'upcoming'>>();
  for (const rel of raw) {
    const key = releaseKey(rel.title);
    if (!key) continue;
    const cur = byKey.get(key);
    if (!cur) {
      byKey.set(key, {
        title: rel.title.replace(EDITION_RE, '').trim() || rel.title,
        date: rel.date,
        type: rel.type,
        cover: rel.cover,
        sources: [{ name: rel.source, url: rel.url }],
      });
      continue;
    }
    if (!cur.sources.some((s) => s.name === rel.source)) cur.sources.push({ name: rel.source, url: rel.url });
    // Store artwork beats the Cover Art Archive fallback, which often 404s.
    if (rel.cover && (!cur.cover || cur.cover.includes('coverartarchive.org'))) cur.cover = rel.cover;
    // MusicBrainz knows live/compilation; stores just say "album".
    if (rel.source === 'MusicBrainz') cur.type = rel.type;
    // Earliest date wins; a full date refines a partial one with the same prefix.
    if (rel.date) {
      if (!cur.date) cur.date = rel.date;
      else if (rel.date.startsWith(cur.date) && rel.date.length > cur.date.length) cur.date = rel.date;
      else if (!cur.date.startsWith(rel.date) && rel.date < cur.date) cur.date = rel.date;
    }
  }
  const t = today();
  return [...byKey.values()]
    .map((r) => ({ ...r, upcoming: !!r.date && r.date > t }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function mergeEvents(raw: RawEvent[]): ShowEvent[] {
  const t = today();
  const byKey = new Map<string, ShowEvent>();
  for (const { source, url, ...e } of raw) {
    if (!e.date || e.date < t) continue;
    const key = `${e.date}|${norm(e.city)}`;
    const cur = byKey.get(key);
    if (!cur) byKey.set(key, { ...e, sources: [{ name: source, url }] });
    else if (!cur.sources.some((s) => s.name === source)) cur.sources.push({ name: source, url });
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
}

interface Settled<T> {
  status: SourceStatus;
  data: T[];
}

async function settle<T>(name: string, fn: () => Promise<T[]>): Promise<Settled<T>> {
  try {
    const data = await fn();
    return { status: { name, ok: true, count: data.length }, data };
  } catch (e) {
    return { status: { name, ok: false, error: (e as Error).message }, data: [] };
  }
}

/** Stored reports are trimmed so a page with hundreds of artists stays small (see followedListJson). */
const MAX_PAST_RELEASES = 30;
const MAX_NEWS = 10;

export const tableFor = (artist: FollowedArtist): ReportTable => (artist.mbid === null ? 'manual_reports' : 'reports');

/** Ask every source about one artist, save the report and return it. */
export async function buildReport(env: Env, artist: FollowedArtist): Promise<Report> {
  const tm = env.TICKETMASTER_API_KEY;
  const bit = env.BANDSINTOWN_APP_ID;
  const [mb, deezer, apple, tmEvents, bitEvents, news] = await Promise.all([
    // Manual artists aren't on MusicBrainz; their releases come from Deezer and Apple Music only.
    artist.mbid !== null ? settle('MusicBrainz', () => recentReleases(artist)) : null,
    settle('Deezer', () => deezerReleases(artist)),
    settle('Apple Music', () => itunesReleases(artist)),
    tm ? settle('Ticketmaster', () => ticketmasterEvents(artist, tm)) : null,
    bit ? settle('Bandsintown', () => bandsintownEvents(artist, bit)) : null,
    settle<NewsItem>('Google News', () => newsFor(artist)),
  ]);
  const eventSources = [tmEvents, bitEvents].filter((x) => x !== null);
  const all: Settled<unknown>[] = [...(mb ? [mb] : []), deezer, apple, ...eventSources, news];

  const releases = mergeReleases([...(mb?.data ?? []), ...deezer.data, ...apple.data]);
  const report: Report = {
    artistId: artist.id,
    fetchedAt: Date.now(),
    releases: [...releases.filter((r) => r.upcoming), ...releases.filter((r) => !r.upcoming).slice(0, MAX_PAST_RELEASES)],
    events: mergeEvents(eventSources.flatMap((s) => s.data)),
    news: news.data.slice(0, MAX_NEWS),
    sources: all.map((s) => s.status),
  };

  // Don't cache a report where everything failed (e.g. a network problem).
  if (all.some((s) => s.status.ok)) await reportsRepo(env.DB, tableFor(artist)).save(report);
  return report;
}
