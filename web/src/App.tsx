import { useState } from 'react';
import { useArtistStates, useConfig, useHashTab, useRefreshReports, type Tab } from './hooks.ts';
import { ArtistSearch } from './components/ArtistSearch.tsx';
import { BulkAddDialog } from './components/BulkAddDialog.tsx';
import { ManualArtistDialog, type ManualDialogTarget } from './components/ManualArtistDialog.tsx';
import { SettingsDialog } from './components/SettingsDialog.tsx';
import { ArtistDialog } from './components/ArtistDialog.tsx';
import { OverviewView } from './views/OverviewView.tsx';
import { ReleasesView } from './views/ReleasesView.tsx';
import { ConcertsView } from './views/ConcertsView.tsx';
import { NewsView } from './views/NewsView.tsx';
import { ManualView } from './views/ManualView.tsx';

const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview',
  releases: 'Releases',
  concerts: 'Concerts',
  news: 'News',
  manual: 'Manual',
};

export function App() {
  const { artists, isLoading, error } = useArtistStates();
  const config = useConfig();
  const refresh = useRefreshReports();
  const [tab, setTab] = useHashTab();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [manualTarget, setManualTarget] = useState<ManualDialogTarget | null>(null);
  const [openArtistId, setOpenArtistId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);

  const hasEventSource = config.ticketmaster || config.bandsintown;
  const openArtist = artists.find((s) => s.artist.id === openArtistId) ?? null;
  // Overview lists MusicBrainz artists; manual ones get their own tab. Releases, Concerts and News show both.
  const mbArtists = artists.filter((s) => s.artist.mbid !== null);
  const manualArtists = artists.filter((s) => s.artist.mbid === null);
  const refreshOne = (id: string) => void refresh([id]);

  const counts: Partial<Record<Tab, string | number>> = {
    releases: artists.reduce((n, s) => n + (s.report?.releases.filter((r) => r.upcoming).length ?? 0), 0) || '',
    concerts: artists.reduce((n, s) => n + (s.report?.events.length ?? 0), 0) || '',
    news: artists.reduce((n, s) => n + (s.report?.news.length ?? 0), 0) || '',
  };
  if (counts.releases) counts.releases = `${counts.releases} upcoming`;
  counts.manual = manualArtists.length || '';

  const refreshAll = async () => {
    setRefreshingAll(true);
    try {
      await refresh(artists.map((s) => s.artist.id));
    } finally {
      setRefreshingAll(false);
    }
  };

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">◉</span>
          <div>
            <h1>Music Radar</h1>
            <p className="sub">New releases, upcoming albums, shows and news for the artists you follow</p>
          </div>
        </div>
        <div className="top-actions">
          <button className="btn ghost" disabled={refreshingAll || !artists.length} onClick={refreshAll} title="Re-check every source now">
            {refreshingAll ? 'Refreshing…' : '↻ Refresh all'}
          </button>
          <button className="btn ghost" onClick={() => setSettingsOpen(true)}>
            ⚙ Settings
          </button>
        </div>
      </header>

      <section className="add">
        <ArtistSearch
          followedMbids={new Set(mbArtists.flatMap((s) => s.artist.mbid ?? []))}
          onAddManually={(name) => {
            setManualTarget({ name });
            setTab('manual');
          }}
        />
        <button className="btn" onClick={() => setBulkOpen(true)}>
          Add many
        </button>
      </section>

      {!hasEventSource && artists.length > 0 && (
        <div className="banner">
          Concert dates need a free Ticketmaster API key.{' '}
          <button className="linkish" onClick={() => setSettingsOpen(true)}>
            Add it in Settings
          </button>{' '}
          — takes about two minutes.
        </div>
      )}

      <nav className="tabs" role="tablist">
        {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
            {counts[t] ? <span className="count">{counts[t]}</span> : null}
          </button>
        ))}
      </nav>

      <main>
        {error ? (
          <div className="empty">
            <h3>Can't reach the Music Radar server</h3>
            <p>{error.message}. Is it running? Start it with <code>npm run dev</code>.</p>
          </div>
        ) : isLoading ? null : (
          <>
            {tab === 'overview' && (
              <OverviewView artists={mbArtists} hasEventSource={hasEventSource} onOpen={setOpenArtistId} onRefresh={refreshOne} />
            )}
            {tab === 'releases' && <ReleasesView artists={artists} />}
            {tab === 'concerts' && (
              <ConcertsView artists={artists} hasEventSource={hasEventSource} onOpenSettings={() => setSettingsOpen(true)} />
            )}
            {tab === 'news' && <NewsView artists={artists} />}
            {tab === 'manual' && (
              <ManualView
                artists={manualArtists}
                hasEventSource={hasEventSource}
                onAdd={() => setManualTarget({ name: '' })}
                onOpen={setOpenArtistId}
                onRefresh={refreshOne}
              />
            )}
          </>
        )}
      </main>

      <BulkAddDialog open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <ManualArtistDialog target={manualTarget} onClose={() => setManualTarget(null)} />
      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <ArtistDialog
        state={openArtist}
        hasEventSource={hasEventSource}
        onClose={() => setOpenArtistId(null)}
        onRefresh={refreshOne}
        onEdit={(artist) => setManualTarget({ artist })}
      />
    </>
  );
}
