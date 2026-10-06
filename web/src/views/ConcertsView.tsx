import { useState } from 'react';
import { EventList } from '../components/EventList.tsx';
import { EmptyState } from '../components/ui.tsx';
import type { ArtistState } from '../hooks.ts';

interface Props {
  artists: ArtistState[];
  hasEventSource: boolean;
  onOpenSettings: () => void;
}

export function ConcertsView({ artists, hasEventSource, onOpenSettings }: Props) {
  const [query, setQuery] = useState('');

  if (!hasEventSource) {
    return (
      <EmptyState title="Concert dates need an API key">
        Add a free Ticketmaster key in{' '}
        <button className="linkish" onClick={onOpenSettings}>
          Settings
        </button>
        . Signing up takes about two minutes, and the key is stored only on this computer.
      </EmptyState>
    );
  }

  const q = query.toLowerCase().trim();
  const events = artists
    .flatMap((s) => (s.report?.events ?? []).map((event) => ({ event, artistName: s.artist.name })))
    .filter(({ event: e, artistName }) => !q || [artistName, e.venue, e.city, e.region, e.country].join(' ').toLowerCase().includes(q))
    .sort((a, b) => a.event.date.localeCompare(b.event.date));

  return (
    <>
      <div className="filters">
        <input type="search" placeholder="Filter by city, country, venue or artist" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="muted">
          {events.length} show{events.length === 1 ? '' : 's'}
        </span>
      </div>
      {events.length ? (
        <EventList items={events} />
      ) : q ? (
        <EmptyState title="No matching shows">Try another city or country.</EmptyState>
      ) : (
        <EmptyState title="No upcoming shows">None of your artists have announced dates on the connected ticketing sources.</EmptyState>
      )}
    </>
  );
}
