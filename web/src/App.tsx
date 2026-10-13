import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';
import { useArtistStates, useConfig, useHashTab, useMe, useRefreshArtist, type Tab } from './hooks.ts';
import { ArtistSearch } from './components/ArtistSearch.tsx';
import { BulkAddDialog } from './components/BulkAddDialog.tsx';
import { ManualArtistDialog, type ManualDialogTarget } from './components/ManualArtistDialog.tsx';
import { SignIn } from './components/SignIn.tsx';
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

/** Shows the sign-in screen until there's a session, then the app. */
export function App() {
  const { me, isLoading, signedOut, error } = useMe();
  if (isLoading) return null;
  if (signedOut) return <SignIn />;
  if (error || !me) {
    return (
      <div className="empty">
        <h3>Can't reach Music Radar</h3>
        <p>{error?.message ?? 'Unknown error'}. Try reloading the page.</p>
      </div>
    );
  }
  return <Radar me={me} />;
}

function Radar({ me }: { me: NonNullable<ReturnType<typeof useMe>['me']> }) {
  const qc = useQueryClient();
  const { refresh, refreshing } = useRefreshArtist();
  const { artists, isLoading, error } = useArtistStates(refreshing);
  const config = useConfig();
  const [tab, setTab] = useHashTab();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [manualTarget, setManualTarget] = useState<ManualDialogTarget | null>(null);
  const [openArtistId, setOpenArtistId] = useState<string | null>(null);

  const hasEventSource = config.ticketmaster || config.bandsintown;
  const openArtist = artists.find((s) => s.artist.id === openArtistId) ?? null;
  // Overview lists MusicBrainz artists; manual ones get their own tab. Releases, Concerts and News show both.
  const mbArtists = artists.filter((s) => s.artist.mbid !== null);
  const manualArtists = artists.filter((s) => s.artist.mbid === null);
  const refreshOne = (id: string) => void refresh(id);

  const counts: Partial<Record<Tab, string | number>> = {
    releases: artists.reduce((n, s) => n + (s.report?.releases.filter((r) => r.upcoming).length ?? 0), 0) || '',
    concerts: artists.reduce((n, s) => n + (s.report?.events.length ?? 0), 0) || '',
    news: artists.reduce((n, s) => n + (s.report?.news.length ?? 0), 0) || '',
  };
  if (counts.releases) counts.releases = `${counts.releases} upcoming`;
  counts.manual = manualArtists.length || '';

  const signOut = async () => {
    await api.logout();
    qc.clear();
    location.href = '/';
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
          <span className="me" title={me.email}>
            {me.picture && <img src={me.picture} alt="" referrerPolicy="no-referrer" />}
            {me.name || me.email}
          </span>
          <button className="btn ghost" onClick={signOut}>
            Sign out
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
            <h3>Can't load your artists</h3>
            <p>{error.message}. Try reloading the page.</p>
          </div>
        ) : isLoading ? null : (
          <>
            {tab === 'overview' && (
              <OverviewView artists={mbArtists} hasEventSource={hasEventSource} onOpen={setOpenArtistId} onRefresh={refreshOne} />
            )}
            {tab === 'releases' && <ReleasesView artists={artists} />}
            {tab === 'concerts' && (
              <ConcertsView artists={artists} hasEventSource={hasEventSource} />
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
