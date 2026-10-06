import { ArtistCard } from '../components/ArtistCard.tsx';
import { EmptyState } from '../components/ui.tsx';
import type { ArtistState } from '../hooks.ts';

interface Props {
  artists: ArtistState[];
  hasEventSource: boolean;
  onOpen: (id: string) => void;
  onRefresh: (id: string) => void;
}

export function OverviewView({ artists, hasEventSource, onOpen, onRefresh }: Props) {
  if (!artists.length) {
    return (
      <EmptyState title="Add your first artist">
        Search above, or use <b>Add many</b> to paste a list. Music Radar then checks MusicBrainz, Deezer, Apple Music, Google News and
        (with a key) Ticketmaster.
      </EmptyState>
    );
  }
  return (
    <div className="grid">
      {artists.map((s) => (
        <ArtistCard
          key={s.artist.id}
          state={s}
          hasEventSource={hasEventSource}
          onOpen={() => onOpen(s.artist.id)}
          onRefresh={() => onRefresh(s.artist.id)}
        />
      ))}
    </div>
  );
}
