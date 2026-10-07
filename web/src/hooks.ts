import { useCallback, useEffect, useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api.ts';
import { REPORT_TTL_MS } from '../../shared/types.ts';
import type { ConfigStatus, FollowedArtist, Report } from '../../shared/types.ts';

export const queryKeys = {
  artists: ['artists'] as const,
  config: ['config'] as const,
  report: (id: string) => ['report', id] as const,
};

export interface ArtistState {
  artist: FollowedArtist;
  report: Report | null;
  isFetching: boolean;
}

/** Followed artists, each with its report. Cached reports show instantly; stale ones re-check in the background. */
export function useArtistStates() {
  const artistsQuery = useQuery({ queryKey: queryKeys.artists, queryFn: api.artists });
  const list = artistsQuery.data ?? [];

  const reports = useQueries({
    queries: list.map((a) => ({
      queryKey: queryKeys.report(a.id),
      queryFn: () => api.report(a.id),
      initialData: a.report ?? undefined,
      initialDataUpdatedAt: a.report?.fetchedAt,
      staleTime: REPORT_TTL_MS,
    })),
  });

  const artists: ArtistState[] = list.map(({ report: _cached, ...artist }, i) => ({
    artist,
    report: reports[i]?.data ?? null,
    isFetching: reports[i]?.isFetching ?? false,
  }));
  return { artists, isLoading: artistsQuery.isLoading, error: artistsQuery.error };
}

export function useConfig(): ConfigStatus {
  const { data } = useQuery({ queryKey: queryKeys.config, queryFn: api.config });
  return data ?? { ticketmaster: false, bandsintown: false };
}

/** Force a fresh check of the given artists, bypassing the 6-hour cache. */
export function useRefreshReports() {
  const qc = useQueryClient();
  return useCallback(
    (ids: string[]) =>
      Promise.all(
        ids.map((id) => qc.fetchQuery({ queryKey: queryKeys.report(id), queryFn: () => api.report(id, true), staleTime: 0 })),
      ),
    [qc],
  );
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
