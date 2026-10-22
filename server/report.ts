// Queries every source for one artist, merges duplicates and caches the result in D1.
import { linkFindings, reportsRepo, type LinkFindingRow, type ReportTable } from './db.ts';
import { norm, today } from './lib/text.ts';
import { recentReleases } from './sources/musicbrainz.ts';
import { deezerReleases } from './sources/deezer.ts';
import { itunesReleases } from './sources/itunes.ts';
import { ticketmasterEvents } from './sources/ticketmaster.ts';
import { bandsintownEvents } from './sources/bandsintown.ts';
import { newsFor } from './sources/news.ts';
import type { Env } from './env.ts';
import { AI_SOURCE_PREFIX, type FollowedArtist, type NewsItem, type Release, type ReleaseFinding, type Report, type ShowEvent, type ShowFinding, type SourceLink, type SourceStatus } from '../shared/types.ts';
import type { RawEvent, RawRelease } from './sources/types.ts';

const EDITION_RE = /\s*[(\[][^)\]]*\b(deluxe|edition|remaster(ed)?|expanded|anniversary|explicit|clean|bonus)\b[^)\]]*[)\]]/gi;
const releaseKey = (title: string) => norm(title.replace(EDITION_RE, '').replace(/\s+-\s+(EP|Single)$/i, ''));

const sourceLink = ({ source, url, quote }: { source: string; url: string; quote?: string }): SourceLink =>
  quote ? { name: source, url, quote } : { name: source, url };

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
        sources: [sourceLink(rel)],
      });
      continue;
    }
    if (!cur.sources.some((s) => s.name === rel.source)) cur.sources.push(sourceLink(rel));
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
  for (const { source, url, quote, ...e } of raw) {
    if (!e.date || e.date < t) continue;
    const key = `${e.date}|${norm(e.city)}`;
    const cur = byKey.get(key);
    const link = sourceLink({ source, url, quote });
    if (!cur) byKey.set(key, { ...e, sources: [link] });
    else if (!cur.sources.some((s) => s.name === source)) cur.sources.push(link);
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Link-reader findings (scripts/link-reader) as one more source, so they merge with the same release or show from the others. */
export function fromLinkFindings(rows: LinkFindingRow[]): { releases: RawRelease[]; events: RawEvent[] } {
  const source = (url: string) => {
    try {
      return `${AI_SOURCE_PREFIX}${new URL(url).hostname.replace(/^www\./, '')}`;
    } catch {
      return `${AI_SOURCE_PREFIX}web`;
    }
  };
  const releases: RawRelease[] = [];
  const events: RawEvent[] = [];
  for (const row of rows) {
    if (row.kind === 'release') {
      const f = JSON.parse(row.data) as ReleaseFinding;
      releases.push({ title: f.title, date: f.date, type: f.type, cover: null, source: source(f.source_url), url: f.source_url, quote: f.quote });
    } else {
      const f = JSON.parse(row.data) as ShowFinding;
      events.push({
        date: f.date, time: '', title: '', venue: f.venue, city: f.city, region: '', country: f.country, status: '',
        source: source(f.source_url), url: f.source_url, quote: f.quote,
      });
    }
  }
  return { releases, events };
}

interface Settled<T> {
  status: SourceStatus;
  data: T[];
  /** How long the source took, for the log line (not stored in the report). */
  ms: number;
}

async function settle<T>(name: string, fn: () => Promise<T[]>): Promise<Settled<T>> {
  const start = Date.now();
  try {
    const data = await fn();
    return { status: { name, ok: true, count: data.length }, data, ms: Date.now() - start };
  } catch (e) {
    return { status: { name, ok: false, error: (e as Error).message }, data: [], ms: Date.now() - start };
  }
}

/** One log line per report, slowest source first: `report "Muse" 7310ms: Google News failed 6900ms (HTTP 503 …), …`. */
export function timingLine(artistName: string, totalMs: number, sources: { status: SourceStatus; ms: number }[]): string {
  const parts = [...sources]
    .sort((a, b) => b.ms - a.ms)
    .map(({ status: s, ms }) => `${s.name} ${s.ok ? 'ok' : 'failed'} ${ms}ms${s.ok ? '' : ` (${s.error})`}`);
  return `report "${artistName}" ${totalMs}ms: ${parts.join(', ')}`;
}

/** Stored reports are trimmed so a page with hundreds of artists stays small (see followedListJson). */
const MAX_PAST_RELEASES = 30;
const MAX_NEWS = 10;

export const tableFor = (artist: FollowedArtist): ReportTable => (artist.mbid === null ? 'manual_reports' : 'reports');

/** Ask every source about one artist, save the report and return it. */
export async function buildReport(env: Env, artist: FollowedArtist): Promise<Report> {
  const tm = env.TICKETMASTER_API_KEY;
  const bit = env.BANDSINTOWN_APP_ID;
  const start = Date.now();
  const [mb, deezer, apple, tmEvents, bitEvents, news, findingRows] = await Promise.all([
    // Manual artists aren't on MusicBrainz; their releases come from Deezer and Apple Music only.
    artist.mbid !== null ? settle('MusicBrainz', () => recentReleases(artist)) : null,
    settle('Deezer', () => deezerReleases(artist)),
    settle('Apple Music', () => itunesReleases(artist)),
    tm ? settle('Ticketmaster', () => ticketmasterEvents(artist, tm)) : null,
    bit ? settle('Bandsintown', () => bandsintownEvents(artist, bit)) : null,
    settle<NewsItem>('Google News', () => newsFor(artist)),
    linkFindings(env.DB, artist.id).catch(() => []), // before migration 0002, or on a D1 hiccup: just skip them
  ]);
  const found = fromLinkFindings(findingRows);
  const eventSources = [tmEvents, bitEvents].filter((x) => x !== null);
  const all: Settled<unknown>[] = [...(mb ? [mb] : []), deezer, apple, ...eventSources, news];
  // Visible in `npx wrangler tail` and the dashboard's Workers Logs: which source makes a refresh slow.
  console.log(timingLine(artist.name, Date.now() - start, all));

  const releases = mergeReleases([...(mb?.data ?? []), ...deezer.data, ...apple.data, ...found.releases]);
  const report: Report = {
    artistId: artist.id,
    fetchedAt: Date.now(),
    releases: [...releases.filter((r) => r.upcoming), ...releases.filter((r) => !r.upcoming).slice(0, MAX_PAST_RELEASES)],
    events: mergeEvents([...eventSources.flatMap((s) => s.data), ...found.events]),
    news: news.data.slice(0, MAX_NEWS),
    sources: [
      ...all.map((s) => s.status),
      ...(findingRows.length ? [{ name: 'Link reader (AI)', ok: true, count: findingRows.length }] : []),
    ],
  };

  // Don't cache a report where everything failed (e.g. a network problem).
  if (all.some((s) => s.status.ok)) await reportsRepo(env.DB, tableFor(artist)).save(report);
  return report;
}
