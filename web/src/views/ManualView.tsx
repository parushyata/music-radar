import { ArtistCard } from '../components/ArtistCard.tsx';
import { EmptyState } from '../components/ui.tsx';
import type { ArtistState } from '../hooks.ts';

interface Props {
  artists: ArtistState[];
  hasEventSource: boolean;
  onAdd: () => void;
  onOpen: (id: string) => void;
  onRefresh: (id: string) => void;
}

/** Artists added by hand because MusicBrainz doesn't list them. */
export function ManualView({ artists, hasEventSource, onAdd, onOpen, onRefresh }: Props) {
  return (
    <>
      <div className="filters">
        <span className="muted grow">
          Artists the search can't find. Their releases, concerts and news are matched by name and also appear in the other tabs.
        </span>
        <button className="btn" onClick={onAdd}>
          Add manually
        </button>
      </div>
      {artists.length ? (
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
      ) : (
        <EmptyState title="No manual artists yet">
          If an artist doesn't show up when you search, add them here with their name and links to their Instagram, Spotify or
          website.
        </EmptyState>
      )}
    </>
  );
}
