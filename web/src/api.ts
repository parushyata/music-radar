import type {
  Artist,
  ArtistCandidate,
  ArtistWithReport,
  BulkResult,
  ConfigStatus,
  ConfigUpdate,
  Report,
} from '../../shared/types.ts';

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(`/api/${path}`, {
    method: init.method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data as T;
}

export const api = {
  artists: () => request<ArtistWithReport[]>('artists'),
  search: (q: string) => request<ArtistCandidate[]>(`search?q=${encodeURIComponent(q)}`),
  follow: (mbid: string) => request<{ artist: Artist; existed: boolean }>('artists', { method: 'POST', body: { mbid } }),
  followMany: (names: string[]) => request<BulkResult[]>('artists/bulk', { method: 'POST', body: { names } }),
  unfollow: (id: string) => request<{ ok: true }>(`artists/${id}`, { method: 'DELETE' }),
  report: (id: string, refresh = false) => request<Report>(`artists/${id}/report${refresh ? '?refresh=1' : ''}`),
  config: () => request<ConfigStatus>('config'),
  saveConfig: (update: ConfigUpdate) => request<ConfigStatus>('config', { method: 'POST', body: update }),
};
