// Queries every source for one artist, merges duplicates and caches the result.
import { manualReportsRepo, reportsRepo } from './db.ts';
import { apiKeys } from './config.ts';
import { norm, today } from './lib/text.ts';
import { recentReleases } from './sources/musicbrainz.ts';
import { deezerReleases } from './sources/deezer.ts';
import { itunesReleases } from './sources/itunes.ts';
import { ticketmasterEvents } from './sources/ticketmaster.ts';
import { bandsintownEvents } from './sources/bandsintown.ts';
import { newsFor } from './sources/news.ts';
import { REPORT_TTL_MS } from '../shared/types.ts';
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

const inflight = new Map<string, Promise<Report>>();

const storeFor = (artist: FollowedArtist) => (artist.mbid === null ? manualReportsRepo : reportsRepo);

export async function getReport(artist: FollowedArtist, force = false): Promise<Report> {
  const cached = storeFor(artist).get(artist.id);
  if (!force && cached && Date.now() - cached.fetchedAt < REPORT_TTL_MS) return cached;

  const pending = inflight.get(artist.id);
  if (pending) return pending;

  const promise = buildReport(artist).finally(() => inflight.delete(artist.id));
  inflight.set(artist.id, promise);
  return promise;
}

async function buildReport(artist: FollowedArtist): Promise<Report> {
  const keys = apiKeys();
  const [mb, deezer, apple, tm, bit, news] = await Promise.all([
    // Manual artists aren't on MusicBrainz; their releases come from Deezer and Apple Music only.
    artist.mbid !== null ? settle('MusicBrainz', () => recentReleases(artist)) : null,
    settle('Deezer', () => deezerReleases(artist)),
    settle('Apple Music', () => itunesReleases(artist)),
    keys.ticketmaster ? settle('Ticketmaster', () => ticketmasterEvents(artist, keys.ticketmaster)) : null,
    keys.bandsintown ? settle('Bandsintown', () => bandsintownEvents(artist, keys.bandsintown)) : null,
    settle<NewsItem>('Google News', () => newsFor(artist)),
  ]);
  const eventSources = [tm, bit].filter((x) => x !== null);
  const all: Settled<unknown>[] = [...(mb ? [mb] : []), deezer, apple, ...eventSources, news];

  const report: Report = {
    artistId: artist.id,
    fetchedAt: Date.now(),
    releases: mergeReleases([...(mb?.data ?? []), ...deezer.data, ...apple.data]),
    events: mergeEvents(eventSources.flatMap((s) => s.data)),
    news: news.data,
    sources: all.map((s) => s.status),
  };

  // Don't cache a report where everything failed (e.g. offline).
  if (all.some((s) => s.status.ok)) storeFor(artist).save(report);
  return report;
}
