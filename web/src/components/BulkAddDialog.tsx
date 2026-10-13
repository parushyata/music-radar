import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { queryKeys, refreshInto } from '../hooks.ts';
import { Modal } from './ui.tsx';
import { BULK_CHUNK, type BulkResult } from '../../../shared/types.ts';

export function BulkAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [done, setDone] = useState(0);

  // The server takes a few names per request (Cloudflare's per-request limits), so send them in groups.
  const bulk = useMutation({
    mutationFn: async (all: string[]) => {
      const results: BulkResult[] = [];
      setDone(0);
      for (let i = 0; i < all.length; i += BULK_CHUNK) {
        const chunk = await api.followMany(all.slice(i, i + BULK_CHUNK));
        results.push(...chunk);
        await qc.invalidateQueries({ queryKey: queryKeys.artists });
        // Fetch reports for newly followed artists now rather than waiting for the background refresh.
        for (const r of chunk) if (r.ok && !r.existed) await refreshInto(qc, r.id).catch(() => {});
        setDone(results.length);
      }
      return results;
    },
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
              Looked up {done} of {names.length} (about 2 seconds each)…
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
