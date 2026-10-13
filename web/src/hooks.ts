import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, SignedOutError } from './api.ts';
import type { ArtistWithReport, ConfigStatus, FollowedArtist, Report } from '../../shared/types.ts';

export const queryKeys = {
  me: ['me'] as const,
  artists: ['artists'] as const,
  config: ['config'] as const,
};

export interface ArtistState {
  artist: FollowedArtist;
  report: Report | null;
  isFetching: boolean;
}

/** The signed-in user; `signedOut` when the session is missing or expired. */
export function useMe() {
  const q = useQuery({ queryKey: queryKeys.me, queryFn: api.me, retry: (n, e) => !(e instanceof SignedOutError) && n < 2 });
  return { me: q.data ?? null, isLoading: q.isLoading, signedOut: q.error instanceof SignedOutError, error: q.error };
}

/**
 * Followed artists with their reports, in one request. The server keeps reports fresh in the
 * background (every 12 hours), so the page only reads; ↻ on an artist checks it right now.
 */
export function useArtistStates(refreshing: Set<string>) {
  const q = useQuery({ queryKey: queryKeys.artists, queryFn: api.artists });
  const artists: ArtistState[] = (q.data ?? []).map(({ report, ...artist }) => ({
    artist: artist as FollowedArtist,
    report,
    isFetching: refreshing.has(artist.id),
  }));
  return { artists, isLoading: q.isLoading, error: q.error };
}

export function useConfig(): ConfigStatus {
  const { data } = useQuery({ queryKey: queryKeys.config, queryFn: api.config });
  return data ?? { ticketmaster: false, bandsintown: false };
}

/** Check one artist's sources now and put the new report into the cached list. */
export async function refreshInto(qc: QueryClient, id: string): Promise<void> {
  const report = await api.refresh(id);
  qc.setQueryData<ArtistWithReport[]>(queryKeys.artists, (list) => list?.map((a) => (a.id === id ? { ...a, report } : a)));
}

/** refreshInto, plus which artists are being refreshed (for spinners). */
export function useRefreshArtist() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState<Set<string>>(new Set());
  const refresh = useCallback(
    async (id: string) => {
      setRefreshing((s) => new Set(s).add(id));
      try {
        await refreshInto(qc, id);
      } finally {
        setRefreshing((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    },
    [qc],
  );
  return { refresh, refreshing };
}

export type Tab = 'overview' | 'releases' | 'concerts' | 'news' | 'manual';
const TABS: Tab[] = ['overview', 'releases', 'concerts', 'news', 'manual'];

/** Selected tab, mirrored in the URL hash so it survives reloads and can be linked to. */
export function useHashTab(): [Tab, (t: Tab) => void] {
  const read = (): Tab => {
    const h = location.hash.slice(1) as Tab;
    return TABS.includes(h) ? h : 'overview';
  };
  const [tab, setTab] = useState<Tab>(read);
  useEffect(() => {
    const onHash = () => setTab(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const select = useCallback((t: Tab) => {
    history.replaceState(null, '', `#${t}`);
    setTab(t);
  }, []);
  return [tab, select];
}
