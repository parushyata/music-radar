import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { queryKeys } from '../hooks.ts';
import { Modal } from './ui.tsx';

export function BulkAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');

  const bulk = useMutation({
    mutationFn: api.followMany,
    onSuccess: (results) => {
      // Leave the names that failed in the box so they can be fixed and retried.
      setText(results.filter((r) => !r.ok).map((r) => r.name).join('\n'));
      qc.invalidateQueries({ queryKey: queryKeys.artists });
    },
  });

  const names = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const close = () => {
    bulk.reset();
    onClose();
  };

  return (
    <Modal open={open} onClose={close}>
      <div className="dlg">
        <h2>Add many artists</h2>
        <p className="muted">One per line (or comma-separated). Ambiguous names are skipped so you can add them with search.</p>
        <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Radiohead\nBillie Eilish\nFontaines D.C.'} />
        <div className="bulk-result">
          {bulk.isPending && (
            <span className="muted">
              Looking up {names.length} artist{names.length === 1 ? '' : 's'} (about 2 seconds each)…
            </span>
          )}
          {bulk.error && <div className="bad">{bulk.error.message}</div>}
          {bulk.data?.map((r) =>
            r.ok ? (
              <div key={r.name} className="ok">
                ✓ {r.name} → {r.matched}
                {r.disambiguation && ` (${r.disambiguation})`}
                {r.existed && ' — already followed'}
              </div>
            ) : (
              <div key={r.name} className="bad">
                ✕ {r.name} — {r.error}
              </div>
            ),
          )}
        </div>
        <div className="dlg-actions">
          <button className="btn ghost" onClick={close}>
            Close
          </button>
          <button className="btn" disabled={bulk.isPending || !names.length} onClick={() => bulk.mutate(names)}>
            Add artists
          </button>
        </div>
      </div>
    </Modal>
  );
}
