import { useState } from 'react';
import { ReleaseGrid } from '../components/ReleaseCard.tsx';
import { EmptyState } from '../components/ui.tsx';
import { daysFromToday } from '../lib/dates.ts';
import { isAlbumish, summarize } from '../lib/summary.ts';
import type { ArtistState } from '../hooks.ts';
import type { Release } from '../../../shared/types.ts';

const FILTERS = {
  all: { label: 'All', test: () => true },
  albums: { label: 'Albums & EPs', test: isAlbumish },
  singles: { label: 'Singles', test: (r: Release) => r.type === 'single' },
  other: { label: 'Live & compilations', test: (r: Release) => !isAlbumish(r) && r.type !== 'single' },
} satisfies Record<string, { label: string; test: (r: Release) => boolean }>;

type FilterKey = keyof typeof FILTERS;

export function ReleasesView({ artists }: { artists: ArtistState[] }) {
  const [filter, setFilter] = useState<FilterKey>('all');

  const all = artists
    .flatMap((s) => (s.report?.releases ?? []).map((release) => ({ release, artistName: s.artist.name })))
    .filter(({ release }) => FILTERS[filter].test(release));

  const upcoming = all.filter((x) => x.release.upcoming).sort((a, b) => a.release.date.localeCompare(b.release.date));
  const recent = all.filter(({ release: r }) => !r.upcoming && r.date.length >= 7 && daysFromToday(r.date) >= -183);
  const latestPerArtist = artists
    .flatMap((s) => {
      const latest = s.report && summarize(s.report).latestAlbum;
      return latest ? [{ release: latest, artistName: s.artist.name }] : [];
    })
    .sort((a, b) => b.release.date.localeCompare(a.release.date));

  return (
    <>
      <div className="filters">
        {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
          <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {FILTERS[k].label}
          </button>
        ))}
      </div>

      <div className="section-title">
        <h2>Upcoming</h2>
        <span className="muted">{upcoming.length}</span>
      </div>
      {upcoming.length ? (
        <ReleaseGrid items={upcoming} />
      ) : (
        <EmptyState title="Nothing announced yet">
          Upcoming releases appear here as soon as a pre-order or a MusicBrainz entry exists. Check the News tab for announcements.
        </EmptyState>
      )}

      <div className="section-title">
        <h2>Released in the last 6 months</h2>
        <span className="muted">{recent.length}</span>
      </div>
      {recent.length ? (
        <ReleaseGrid items={recent} />
      ) : (
        <EmptyState title="Quiet lately">None of your artists released anything matching this filter in the last 6 months.</EmptyState>
      )}

      {(filter === 'all' || filter === 'albums') && latestPerArtist.length > 0 && (
        <>
          <div className="section-title">
            <h2>Latest album from each artist</h2>
          </div>
          <ReleaseGrid items={latestPerArtist} />
        </>
      )}
    </>
  );
}
