// Ticketmaster Discovery API (free key): concerts worldwide with ticket links.
// https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
import { fetchJSON } from '../lib/http.ts';
import { norm } from '../lib/text.ts';
import type { Artist } from '../../shared/types.ts';
import type { RawEvent } from './types.ts';

const BASE = 'https://app.ticketmaster.com/discovery/v2';

interface TmAttraction {
  id: string;
  name: string;
  externalLinks?: { musicbrainz?: { id: string }[] };
}

interface TmEvent {
  name: string;
  url: string;
  dates?: { start?: { localDate?: string; localTime?: string }; status?: { code?: string } };
  _embedded?: {
    venues?: { name?: string; city?: { name?: string }; state?: { stateCode?: string }; country?: { name?: string } }[];
  };
}

export async function ticketmasterEvents(artist: Artist, apiKey: string): Promise<RawEvent[]> {
  const attractions = await fetchJSON<{ _embedded?: { attractions?: TmAttraction[] } }>(
    `${BASE}/attractions.json?apikey=${apiKey}&keyword=${encodeURIComponent(artist.name)}&classificationName=music&size=20`,
  );
  const list = attractions._embedded?.attractions ?? [];
  // Ticketmaster often stores the MusicBrainz ID, which avoids same-name mix-ups.
  const match =
    list.find((a) => (a.externalLinks?.musicbrainz ?? []).some((m) => m.id === artist.mbid)) ??
    list.find((a) => norm(a.name) === norm(artist.name));
  if (!match) return [];

  const events = await fetchJSON<{ _embedded?: { events?: TmEvent[] } }>(
    `${BASE}/events.json?apikey=${apiKey}&attractionId=${match.id}&size=100&sort=date,asc`,
  );
  return (events._embedded?.events ?? []).map((e) => {
    const v = e._embedded?.venues?.[0] ?? {};
    return {
      date: e.dates?.start?.localDate ?? '',
      time: e.dates?.start?.localTime?.slice(0, 5) ?? '',
      title: e.name,
      venue: v.name ?? '',
      city: v.city?.name ?? '',
      region: v.state?.stateCode ?? '',
      country: v.country?.name ?? '',
      status: e.dates?.status?.code ?? '',
      source: 'Ticketmaster',
      url: e.url,
    };
  });
}
