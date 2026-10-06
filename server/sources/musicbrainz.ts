// MusicBrainz: artist identity, links to socials/stores, and dated release groups.
// https://musicbrainz.org/doc/MusicBrainz_API
import { fetchJSON, HttpError, sleep } from '../lib/http.ts';
import { luceneEscape } from '../lib/text.ts';
import type { Artist, ArtistCandidate } from '../../shared/types.ts';
import type { RawRelease } from './types.ts';

interface MbArtist {
  id: string;
  name: string;
  score?: number;
  type?: string;
  country?: string;
  disambiguation?: string;
  area?: { name: string };
  aliases?: { name: string }[];
  tags?: { name: string; count: number }[];
  relations?: MbRelation[];
}

export interface MbRelation {
  type: string;
  ended?: boolean;
  url?: { resource: string };
}

interface MbReleaseGroup {
  id: string;
  title: string;
  'primary-type'?: string;
  'secondary-types'?: string[];
  'first-release-date'?: string;
  releases?: { status?: string }[];
}

// MusicBrainz allows ~1 request/second, so every call goes through one queue.
let queue: Promise<unknown> = Promise.resolve();

function mb<T>(endpoint: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`https://musicbrainz.org/ws/2/${endpoint}`);
  for (const [k, v] of Object.entries({ ...params, fmt: 'json' })) url.searchParams.set(k, String(v));

  const run = async (): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchJSON<T>(url);
      } catch (e) {
        if (e instanceof HttpError && e.status === 503 && attempt < 3) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        throw e;
      }
    }
  };
  const result = queue.then(run);
  queue = result.catch(() => {}).then(() => sleep(1100));
  return result;
}

export async function searchArtists(q: string): Promise<ArtistCandidate[]> {
  const data = await mb<{ artists?: MbArtist[] }>('artist', { query: luceneEscape(q), limit: 10 });
  return (data.artists ?? []).map((a) => ({
    mbid: a.id,
    name: a.name,
    disambiguation: a.disambiguation ?? '',
    country: a.country ?? a.area?.name ?? '',
    type: a.type ?? '',
    score: a.score ?? 0,
    aliases: (a.aliases ?? []).map((x) => x.name),
    tags: (a.tags ?? []).sort((x, y) => y.count - x.count).slice(0, 3).map((t) => t.name),
  }));
}

export async function getArtistWithLinks(mbid: string) {
  const a = await mb<MbArtist>(`artist/${mbid}`, { inc: 'url-rels' });
  return {
    mbid: a.id,
    name: a.name,
    disambiguation: a.disambiguation ?? '',
    country: a.country ?? a.area?.name ?? '',
    type: a.type ?? '',
    relations: a.relations ?? [],
  };
}

/** Official album/EP/single release groups from the last few years plus anything announced. */
export async function recentReleases(artist: Artist): Promise<RawRelease[]> {
  const since = `${new Date().getFullYear() - 3}-01-01`;
  const data = await mb<{ 'release-groups'?: MbReleaseGroup[] }>('release-group', {
    query: `arid:${artist.mbid} AND firstreleasedate:[${since} TO *]`,
    limit: 100,
  });
  return (data['release-groups'] ?? [])
    .filter((rg) => {
      const statuses = (rg.releases ?? []).map((r) => r.status).filter(Boolean);
      return !statuses.length || statuses.some((s) => s !== 'Bootleg');
    })
    .filter((rg) => ['Album', 'EP', 'Single'].includes(rg['primary-type'] ?? ''))
    .map((rg) => {
      const secondary = rg['secondary-types'] ?? [];
      let type = (rg['primary-type'] ?? 'album').toLowerCase();
      if (secondary.includes('Live')) type = 'live';
      else if (secondary.includes('Compilation')) type = 'compilation';
      else if (secondary[0]) type = secondary[0].toLowerCase();
      return {
        title: rg.title,
        date: rg['first-release-date'] ?? '',
        type,
        // Cover Art Archive; the UI falls back to a placeholder when it 404s.
        cover: `https://coverartarchive.org/release-group/${rg.id}/front-250`,
        source: 'MusicBrainz',
        url: `https://musicbrainz.org/release-group/${rg.id}`,
      };
    });
}
