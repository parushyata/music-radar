import { useState } from 'react';
import { EventList } from '../components/EventList.tsx';
import { EmptyState } from '../components/ui.tsx';
import type { ArtistState } from '../hooks.ts';
import { WINDOWS, windowEnd } from '../concerts.ts';


interface Props {
  artists: ArtistState[];
  hasEventSource: boolean;
}

export function ConcertsView({ artists, hasEventSource }: Props) {
  const [query, setQuery] = useState('');
  const [windowIndex, setWindowIndex] = useState(0);

  if (!hasEventSource) {
    return (
      <EmptyState title="Concert dates aren't switched on">
        This Music Radar has no Ticketmaster key yet. Whoever runs it can add one with{' '}
        <code>npx wrangler secret put TICKETMASTER_API_KEY</code>.
      </EmptyState>
    );
  }

  const q = query.toLowerCase().trim();
  const end = windowEnd(WINDOWS[windowIndex], new Date());
  const events = artists
    .flatMap((s) => (s.report?.events ?? []).map((event) => ({ event, artistName: s.artist.name })))
    .filter(({ event: e, artistName }) =>
      (!q || [artistName, e.venue, e.city, e.region, e.country].join(' ').toLowerCase().includes(q)) &&
      (!end || e.date <= end))
    .sort((a, b) => a.event.date.localeCompare(b.event.date));

  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Filter by city, country, venue or artist" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={windowIndex} onChange={(e) => setWindowIndex(Number(e.target.value))}>
          {WINDOWS.map((w, i) => (
            <option key={w.label} value={i}>
              {w.label}
            </option>
          ))}
        </select>
        <span className="muted">
          {events.length} show{events.length === 1 ? '' : 's'}
        </span>
      </div>
      {events.length ? (
        <EventList items={events} />
      ) : q || end ? (
        <EmptyState title="No matching shows">Try another city, country or a longer time window.</EmptyState>
      ) : (
        <EmptyState title="No upcoming shows">None of your artists have announced dates on the connected ticketing sources.</EmptyState>
      )}
    </>
  );
}
