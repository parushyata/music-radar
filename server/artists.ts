import { artistsRepo, manualArtistsRepo } from './db.ts';
import { norm } from './lib/text.ts';
import { getArtistWithLinks, searchArtists } from './sources/musicbrainz.ts';
import { findDeezerArtist } from './sources/deezer.ts';
import { findItunesArtistId } from './sources/itunes.ts';
import type { Artist, ArtistLink, BulkResult, ManualArtist, ManualArtistInput } from '../shared/types.ts';

const LINK_LABELS: [host: string, label: string][] = [
  ['instagram.com', 'Instagram'], ['twitter.com', 'X / Twitter'], ['x.com', 'X / Twitter'],
  ['facebook.com', 'Facebook'], ['tiktok.com', 'TikTok'], ['youtube.com', 'YouTube'],
  ['soundcloud.com', 'SoundCloud'], ['open.spotify.com', 'Spotify'], ['music.apple.com', 'Apple Music'],
  ['itunes.apple.com', 'Apple Music'], ['bandcamp.com', 'Bandcamp'], ['deezer.com', 'Deezer'],
  ['bandsintown.com', 'Bandsintown'], ['songkick.com', 'Songkick'], ['last.fm', 'Last.fm'],
  ['threads.net', 'Threads'], ['bsky.app', 'Bluesky'], ['wikidata.org', 'Wikidata'], ['discogs.com', 'Discogs'],
];

function classifyLink(url: string, isHomepage = false): ArtistLink | null {
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  const hit = LINK_LABELS.find(([h]) => host === h || host.endsWith(`.${h}`));
  if (hit) return { label: hit[1], url };
  if (isHomepage) return { label: 'Website', url };
  return null;
}

/** One link per label, sorted, so artist cards stay tidy. */
function dedupeLinks(links: (ArtistLink | null)[]): ArtistLink[] {
  const out: ArtistLink[] = [];
  for (const link of links) if (link && !out.some((l) => l.label === link.label)) out.push(link);
  return out.sort((x, y) => x.label.localeCompare(y.label));
}

/** Deezer and Apple Music IDs found in the artist's own links take priority over a name search. */
async function findStoreIds(name: string, urls: string[]) {
  const deezerIds = urls.flatMap((u) => u.match(/deezer\.com\/(?:\w+\/)?artist\/(\d+)/)?.[1] ?? []);
  const appleId = urls.map((u) => u.match(/(?:music|itunes)\.apple\.com\/.*artist\/(?:[^/]+\/)?(?:id)?(\d+)/)?.[1]).find(Boolean);
  const [deezer, itunesId] = await Promise.all([
    findDeezerArtist(name, deezerIds).catch(() => null),
    appleId ? Number(appleId) : findItunesArtistId(name).catch(() => null),
  ]);
  return {
    deezerId: deezer?.id ?? null,
    itunesId,
    image: deezer?.picture_big ?? deezer?.picture_medium ?? null,
  };
}

/** Look an artist up on MusicBrainz and cross-reference their Deezer and Apple Music IDs. */
async function resolveArtist(mbid: string): Promise<Artist> {
  const a = await getArtistWithLinks(mbid);
  const active = a.relations.filter((r) => !r.ended);

  return {
    id: crypto.randomUUID(),
    mbid: a.mbid,
    name: a.name,
    disambiguation: a.disambiguation,
    country: a.country,
    type: a.type,
    ...(await findStoreIds(a.name, active.map((r) => r.url?.resource ?? ''))),
    links: dedupeLinks(active.map((r) => classifyLink(r.url?.resource ?? '', r.type === 'official homepage'))),
    addedAt: new Date().toISOString(),
  };
}

/**
 * Follow a MusicBrainz artist. The artist row is shared: someone else may already follow them,
 * in which case nothing needs looking up. `existed` means this user already followed them.
 */
export async function followArtist(db: D1Database, userId: string, mbid: string): Promise<{ artist: Artist; existed: boolean }> {
  const repo = artistsRepo(db);
  let artist = await repo.getByMbid(mbid);
  if (!artist) {
    const resolved = await resolveArtist(mbid);
    try {
      await repo.insert(resolved);
      artist = resolved;
    } catch (e) {
      // Two people adding the same new artist at once: the other insert won.
      artist = await repo.getByMbid(mbid);
      if (!artist) throw e;
    }
  }
  const added = await repo.follow(userId, artist.id);
  return { artist, existed: !added };
}

/** Build a manual artist from the form, looking their Deezer and Apple Music IDs up again. */
async function buildManualArtist(input: ManualArtistInput, id: string, addedAt: string): Promise<ManualArtist> {
  const name = input.name.trim();
  // Accept "instagram.com/x" as well as full URLs; anything unrecognised is treated as their website.
  const urls = input.links.map((u) => u.trim()).filter(Boolean).map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`));
  return {
    id,
    mbid: null,
    name,
    disambiguation: input.disambiguation?.trim() ?? '',
    country: '',
    type: '',
    ...(await findStoreIds(name, urls)),
    links: dedupeLinks(urls.map((u) => classifyLink(u, true))),
    addedAt,
  };
}

/**
 * Follow an artist MusicBrainz doesn't list. Their releases, concerts and news are looked
 * up by name, unless the links include their Deezer or Apple Music page.
 */
export async function addManualArtist(db: D1Database, userId: string, input: ManualArtistInput): Promise<{ artist: ManualArtist; existed: boolean }> {
  const repo = manualArtistsRepo(db);
  const existing = await repo.getByName(userId, input.name.trim());
  if (existing) return { artist: existing, existed: true };
  const artist = await buildManualArtist(input, crypto.randomUUID(), new Date().toISOString());
  await repo.insert(userId, artist);
  return { artist, existed: false };
}

/** Save edits to a manual artist; its cached report is dropped so it's re-checked with the new details. */
export async function updateManualArtist(db: D1Database, userId: string, current: ManualArtist, input: ManualArtistInput): Promise<ManualArtist> {
  const artist = await buildManualArtist(input, current.id, current.addedAt);
  await manualArtistsRepo(db).update(userId, artist);
  return artist;
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

/** Callers keep `names` short (see BULK_CHUNK): each artist takes ~5 outside requests and the free plan allows 50. */
export async function followMany(db: D1Database, userId: string, names: string[]): Promise<BulkResult[]> {
  const results: BulkResult[] = [];
  for (const name of names) {
    try {
      const match = await bestMatch(name);
      if (!match) {
        results.push({ name, ok: false, error: 'No confident match — add it with search instead' });
        continue;
      }
      const { artist, existed } = await followArtist(db, userId, match.mbid);
      results.push({ name, ok: true, existed, id: artist.id, matched: artist.name, disambiguation: artist.disambiguation });
    } catch (e) {
      results.push({ name, ok: false, error: (e as Error).message });
    }
  }
  return results;
}
