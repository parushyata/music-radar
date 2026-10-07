import type {
  Artist,
  ArtistCandidate,
  ArtistWithReport,
  BulkResult,
  ConfigStatus,
  ConfigUpdate,
  ManualArtist,
  ManualArtistInput,
  Report,
} from '../../shared/types.ts';

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const hasBody = init.body !== undefined;
  const res = await fetch(`/api/${path}`, {
    method: init.method,
    headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(init.body) : undefined,
  });
  // A server that predates an endpoint answers in plain text ("404 Not Found"), not JSON.
  const text = await res.text();
  let data: { error?: string } | undefined;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(res.ok ? 'The server sent an unreadable reply' : `${res.status} ${text || res.statusText} — try restarting the server`);
  }
  if (!res.ok) throw new Error(data?.error ?? res.statusText);
  return data as T;
}

export const api = {
  artists: () => request<ArtistWithReport[]>('artists'),
  search: (q: string) => request<ArtistCandidate[]>(`search?q=${encodeURIComponent(q)}`),
  follow: (mbid: string) => request<{ artist: Artist; existed: boolean }>('artists', { method: 'POST', body: { mbid } }),
  addManual: (input: ManualArtistInput) =>
    request<{ artist: ManualArtist; existed: boolean }>('manual-artists', { method: 'POST', body: input }),
  updateManual: (id: string, input: ManualArtistInput) =>
    request<ManualArtist>(`manual-artists/${id}`, { method: 'PUT', body: input }),
  followMany: (names: string[]) => request<BulkResult[]>('artists/bulk', { method: 'POST', body: { names } }),
  unfollow: (id: string) => request<{ ok: true }>(`artists/${id}`, { method: 'DELETE' }),
  report: (id: string, refresh = false) => request<Report>(`artists/${id}/report${refresh ? '?refresh=1' : ''}`),
  config: () => request<ConfigStatus>('config'),
  saveConfig: (update: ConfigUpdate) => request<ConfigStatus>('config', { method: 'POST', body: update }),
};
