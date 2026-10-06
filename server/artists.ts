import { randomUUID } from 'node:crypto';
import { artistsRepo } from './db.ts';
import { norm } from './lib/text.ts';
import { getArtistWithLinks, searchArtists, type MbRelation } from './sources/musicbrainz.ts';
import { findDeezerArtist } from './sources/deezer.ts';
import { findItunesArtistId } from './sources/itunes.ts';
import type { Artist, ArtistLink, BulkResult } from '../shared/types.ts';

const LINK_LABELS: [host: string, label: string][] = [
  ['instagram.com', 'Instagram'], ['twitter.com', 'X / Twitter'], ['x.com', 'X / Twitter'],
  ['facebook.com', 'Facebook'], ['tiktok.com', 'TikTok'], ['youtube.com', 'YouTube'],
  ['soundcloud.com', 'SoundCloud'], ['open.spotify.com', 'Spotify'], ['music.apple.com', 'Apple Music'],
  ['itunes.apple.com', 'Apple Music'], ['bandcamp.com', 'Bandcamp'], ['deezer.com', 'Deezer'],
  ['bandsintown.com', 'Bandsintown'], ['songkick.com', 'Songkick'], ['last.fm', 'Last.fm'],
  ['threads.net', 'Threads'], ['bsky.app', 'Bluesky'], ['wikidata.org', 'Wikidata'], ['discogs.com', 'Discogs'],
];

function classifyLink(rel: MbRelation): ArtistLink | null {
  const url = rel.url?.resource ?? '';
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  const hit = LINK_LABELS.find(([h]) => host === h || host.endsWith(`.${h}`));
  if (hit) return { label: hit[1], url };
  if (rel.type === 'official homepage') return { label: 'Website', url };
  return null;
}

/** Look an artist up on MusicBrainz and cross-reference their Deezer and Apple Music IDs. */
async function resolveArtist(mbid: string): Promise<Artist> {
  const a = await getArtistWithLinks(mbid);
  const active = a.relations.filter((r) => !r.ended);

  const links: ArtistLink[] = [];
  for (const rel of active) {
    const link = classifyLink(rel);
    if (link && !links.some((l) => l.label === link.label)) links.push(link);
  }

  const urls = active.map((r) => r.url?.resource ?? '');
  const deezerIds = urls.flatMap((u) => u.match(/deezer\.com\/(?:\w+\/)?artist\/(\d+)/)?.[1] ?? []);
  const appleId = urls.map((u) => u.match(/(?:music|itunes)\.apple\.com\/.*artist\/(?:[^/]+\/)?(?:id)?(\d+)/)?.[1]).find(Boolean);

  const [deezer, itunesId] = await Promise.all([
    findDeezerArtist(a.name, deezerIds).catch(() => null),
    appleId ? Number(appleId) : findItunesArtistId(a.name).catch(() => null),
  ]);

  return {
    id: randomUUID(),
    mbid: a.mbid,
    name: a.name,
    disambiguation: a.disambiguation,
    country: a.country,
    type: a.type,
    deezerId: deezer?.id ?? null,
    itunesId,
    image: deezer?.picture_big ?? deezer?.picture_medium ?? null,
    links: links.sort((x, y) => x.label.localeCompare(y.label)),
    addedAt: new Date().toISOString(),
  };
}

export async function followArtist(mbid: string): Promise<{ artist: Artist; existed: boolean }> {
  const existing = artistsRepo.getByMbid(mbid);
  if (existing) return { artist: existing, existed: true };
  const artist = await resolveArtist(mbid);
  artistsRepo.insert(artist);
  return { artist, existed: false };
}

/** Only accept confident matches so bulk import never silently follows the wrong "Muse". */
async function bestMatch(name: string) {
  const candidates = await searchArtists(name);
  const n = norm(name);
  return (
    candidates.find((c) => norm(c.name) === n && c.score >= 90) ??
    candidates.find((c) => c.aliases.some((x) => norm(x) === n) && c.score >= 90) ??
    (candidates[0]?.score === 100 ? candidates[0] : null)
  );
}

export async function followMany(names: string[]): Promise<BulkResult[]> {
  const results: BulkResult[] = [];
  for (const name of names) {
    try {
      const match = await bestMatch(name);
      if (!match) {
        results.push({ name, ok: false, error: 'No confident match — add it with search instead' });
        continue;
      }
      const { artist, existed } = await followArtist(match.mbid);
      results.push({ name, ok: true, existed, matched: artist.name, disambiguation: artist.disambiguation });
    } catch (e) {
      results.push({ name, ok: false, error: (e as Error).message });
    }
  }
  return results;
}
