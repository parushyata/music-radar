import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { queryKeys } from '../hooks.ts';
import { Modal } from './ui.tsx';
import type { ManualArtist, ManualArtistInput } from '../../../shared/types.ts';

/** Start a new manual artist (optionally with a name from the search box), or edit an existing one. */
export type ManualDialogTarget = { name: string } | { artist: ManualArtist };

/** Follow an artist MusicBrainz doesn't list, by name plus links to their pages, or edit one. */
export function ManualArtistDialog({ target, onClose }: { target: ManualDialogTarget | null; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = target && 'artist' in target ? target.artist : null;
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [links, setLinks] = useState('');

  const save = useMutation({
    mutationFn: async (input: ManualArtistInput) =>
      editing ? { artist: await api.updateManual(editing.id, input), existed: false } : api.addManual(input),
    onSuccess: ({ artist }) => {
      qc.invalidateQueries({ queryKey: queryKeys.artists });
      // The server dropped the cached report, so fetch one with the new details.
      if (editing) qc.invalidateQueries({ queryKey: queryKeys.report(artist.id) });
    },
  });

  useEffect(() => {
    if (!target) return;
    const a = 'artist' in target ? target.artist : null;
    setName('artist' in target ? target.artist.name : target.name);
    setNote(a?.disambiguation ?? '');
    setLinks(a ? a.links.map((l) => l.url).join('\n') : '');
  }, [target]);

  const close = () => {
    save.reset();
    onClose();
  };

  const submit = () => save.mutate({ name: name.trim(), disambiguation: note.trim(), links: links.split(/\s+/).filter(Boolean) });
  const result = save.data;
  const found = result && (result.artist.deezerId || result.artist.itunesId);

  return (
    <Modal open={!!target} onClose={close}>
      <div className="dlg">
        <h2>{editing ? `Edit ${editing.name}` : 'Add an artist manually'}</h2>
        <p className="muted">
          {editing
            ? 'Saving looks the artist up again on Deezer and Apple Music and re-checks every source.'
            : "For artists the search can't find."}{' '}
          Releases, concerts and news are looked up by name. Add their Deezer or Apple Music page to make sure releases come
          from the right artist.
        </p>
        <label>
          Name
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="CLOVES" />
        </label>
        <label>
          <span>
            Note&nbsp;<span className="muted">(optional)</span>
          </span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. London singer-songwriter" />
        </label>
        <label>
          <span>
            Links&nbsp;<span className="muted">(one per line)</span>
          </span>
          <textarea
            rows={5}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            placeholder={'instagram.com/thisiscloves\nopen.spotify.com/artist/…\nthisiscloves.com'}
          />
        </label>
        <div className="bulk-result">
          {save.isPending && <span className="muted">Looking up {name.trim()} on Deezer and Apple Music…</span>}
          {save.error && <div className="bad">{save.error.message}</div>}
          {result && (
            <div className="ok">
              ✓ {result.artist.name}
              {result.existed
                ? ' — already in your manual list'
                : `${editing ? ' saved' : ' added'}${found ? '' : ', but not found on Deezer or Apple Music, so no releases yet'}`}
            </div>
          )}
        </div>
        <div className="dlg-actions">
          <button className="btn ghost" onClick={close}>
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && (
            <button className="btn" disabled={save.isPending || !name.trim()} onClick={submit}>
              {editing ? 'Save' : 'Add artist'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
