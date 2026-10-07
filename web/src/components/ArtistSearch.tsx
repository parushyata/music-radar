import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { queryKeys } from '../hooks.ts';
import type { ArtistCandidate } from '../../../shared/types.ts';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** Search box with MusicBrainz suggestions; picking one follows the artist. */
export function ArtistSearch({
  followedMbids,
  onAddManually,
}: {
  followedMbids: Set<string>;
  onAddManually: (name: string) => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = useDebounced(text.trim(), 350);

  const search = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.search(q),
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
  });
  const results = search.data ?? [];

  const follow = useMutation({
    mutationFn: (c: ArtistCandidate) => api.follow(c.mbid),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.artists }),
    onError: (e, c) => alert(`Could not add ${c.name}: ${e.message}`),
  });

  const pick = (c: ArtistCandidate | undefined) => {
    if (!c) return;
    setText('');
    setOpen(false);
    follow.mutate(c);
  };

  const addManually = () => {
    const name = text.trim();
    setText('');
    setOpen(false);
    onAddManually(name);
  };

  const pending = text.trim() !== q || search.isFetching;
  let message: string | null = null;
  if (pending) message = 'Searching…';
  else if (search.error) message = `Search failed: ${search.error.message}`;
  else if (!results.length) message = 'No artists found';

  return (
    <div className="search-wrap">
      <input
        type="search"
        placeholder={follow.isPending ? 'Adding…' : 'Add an artist or band — e.g. Phoebe Bridgers, Radiohead, Rosalía…'}
        autoComplete="off"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(e.target.value.trim().length >= 2);
          setActive(-1);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (!results.length) return;
            setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
          } else if (e.key === 'Enter' && !pending) {
            pick(results[Math.max(active, 0)]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul className="suggestions">
          {message ? (
            <li className="s-msg">{message}</li>
          ) : (
            results.map((r, i) => (
              <li
                key={r.mbid}
                className={i === active ? 'active' : undefined}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(r);
                }}
              >
                <span>
                  <span className="s-name">{r.name}</span>{' '}
                  <span className="s-meta">{[r.disambiguation, r.tags.join(', ')].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="s-meta">
                  {followedMbids.has(r.mbid) ? '✓ following' : [r.type, r.country].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))
          )}
          {!pending && (
            <li
              className="s-manual"
              onMouseDown={(e) => {
                e.preventDefault();
                addManually();
              }}
            >
              <span className="linkish">Not listed? Add “{text.trim()}” manually</span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
