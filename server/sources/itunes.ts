// iTunes Search API (no key): Apple Music catalogue, including pre-orders with future dates.
import { fetchJSON } from '../lib/http.ts';
import { norm } from '../lib/text.ts';
import type { Artist } from '../../shared/types.ts';
import type { RawRelease } from './types.ts';

interface ItunesResult {
  wrapperType: string;
  artistId?: number;
  artistName?: string;
  collectionName?: string;
  collectionViewUrl?: string;
  releaseDate?: string;
  artworkUrl100?: string;
}

export async function findItunesArtistId(name: string): Promise<number | null> {
  const data = await fetchJSON<{ results?: ItunesResult[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=musicArtist&limit=10`,
  );
  return (data.results ?? []).find((r) => norm(r.artistName) === norm(name))?.artistId ?? null;
}

export async function itunesReleases(artist: Artist): Promise<RawRelease[]> {
  if (!artist.itunesId) return [];
  const data = await fetchJSON<{ results?: ItunesResult[] }>(
    `https://itunes.apple.com/lookup?id=${artist.itunesId}&entity=album&limit=200&sort=recent`,
  );
  return (data.results ?? [])
    .filter((r) => r.wrapperType === 'collection' && r.artistId === artist.itunesId && r.collectionName)
    .map((r) => {
      const name = r.collectionName!;
      return {
        title: name.replace(/\s+-\s+(EP|Single)$/i, ''),
        date: (r.releaseDate ?? '').slice(0, 10),
        type: / - Single$/i.test(name) ? 'single' : / - EP$/i.test(name) ? 'ep' : 'album',
        cover: r.artworkUrl100?.replace('100x100', '250x250') ?? null,
        source: 'Apple Music',
        url: r.collectionViewUrl ?? '',
      };
    });
}
