// Deezer public API (no key): artist photos and full discography with release dates.
import { fetchJSON } from '../lib/http.ts';
import { norm } from '../lib/text.ts';
import type { FollowedArtist } from '../../shared/types.ts';
import type { RawRelease } from './types.ts';

interface DeezerArtist {
  id: number;
  name: string;
  nb_fan: number;
  picture_medium?: string;
  picture_big?: string;
  error?: unknown;
}

interface DeezerAlbum {
  title: string;
  link: string;
  release_date?: string;
  record_type?: string;
  cover_medium?: string;
}

/** Prefer the IDs MusicBrainz links to; otherwise the most-followed exact name match. */
export async function findDeezerArtist(name: string, knownIds: string[]): Promise<DeezerArtist | null> {
  const data = await fetchJSON<{ data?: DeezerArtist[] }>(
    `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=25`,
  );
  const list = data.data ?? [];
  const byFans = (x: DeezerArtist, y: DeezerArtist) => y.nb_fan - x.nb_fan;

  const known = list.filter((x) => knownIds.includes(String(x.id)));
  if (known.length) return known.sort(byFans)[0];
  for (const id of knownIds) {
    try {
      const a = await fetchJSON<DeezerArtist>(`https://api.deezer.com/artist/${id}`);
      if (!a.error) return a;
    } catch {
      // try the next linked ID
    }
  }
  return list.filter((x) => norm(x.name) === norm(name)).sort(byFans)[0] ?? null;
}

export async function deezerReleases(artist: FollowedArtist): Promise<RawRelease[]> {
  if (!artist.deezerId) return [];
  const data = await fetchJSON<{ data?: DeezerAlbum[]; error?: { message?: string } }>(
    `https://api.deezer.com/artist/${artist.deezerId}/albums?limit=100`,
  );
  if (data.error) throw new Error(data.error.message ?? 'Deezer error');
  return (data.data ?? []).map((al) => ({
    title: al.title,
    date: al.release_date ?? '',
    type: al.record_type === 'compile' ? 'compilation' : al.record_type || 'album',
    cover: al.cover_medium ?? null,
    source: 'Deezer',
    url: al.link,
  }));
}
