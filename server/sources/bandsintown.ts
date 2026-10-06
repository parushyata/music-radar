// Bandsintown (requires an app ID issued by Bandsintown): smaller club and indie shows.
import { fetchJSON } from '../lib/http.ts';
import type { Artist } from '../../shared/types.ts';
import type { RawEvent } from './types.ts';

interface BitEvent {
  datetime?: string;
  title?: string;
  lineup?: string[];
  url: string;
  venue?: { name?: string; city?: string; region?: string; country?: string };
}

export async function bandsintownEvents(artist: Artist, appId: string): Promise<RawEvent[]> {
  const data = await fetchJSON<BitEvent[] | unknown>(
    `https://rest.bandsintown.com/artists/${encodeURIComponent(artist.name)}/events?app_id=${encodeURIComponent(appId)}&date=upcoming`,
  );
  if (!Array.isArray(data)) return [];
  return (data as BitEvent[]).map((e) => ({
    date: (e.datetime ?? '').slice(0, 10),
    time: (e.datetime ?? '').slice(11, 16),
    title: e.title || (e.lineup ?? []).join(', '),
    venue: e.venue?.name ?? '',
    city: e.venue?.city ?? '',
    region: e.venue?.region ?? '',
    country: e.venue?.country ?? '',
    status: '',
    source: 'Bandsintown',
    url: e.url,
  }));
}
