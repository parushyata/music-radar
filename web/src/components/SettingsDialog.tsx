import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { queryKeys, useConfig } from '../hooks.ts';
import { ExternalLink, Modal } from './ui.tsx';
import type { ConfigUpdate } from '../../../shared/types.ts';

const StatusPill = ({ on }: { on: boolean }) => <span className={`pill ${on ? 'on' : 'off'}`}>{on ? 'connected' : 'not set'}</span>;

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const config = useConfig();
  const [tmKey, setTmKey] = useState('');
  const [bitId, setBitId] = useState('');

  const save = useMutation({
    mutationFn: api.saveConfig,
    onSuccess: (status) => {
      qc.setQueryData(queryKeys.config, status);
      // The server dropped its cache; re-check every artist with the new keys.
      qc.invalidateQueries({ queryKey: ['report'] });
      close();
    },
  });

  const close = () => {
    setTmKey('');
    setBitId('');
    onClose();
  };

  const submit = () => {
    const update: ConfigUpdate = {};
    if (tmKey.trim()) update.ticketmasterKey = tmKey;
    if (bitId.trim()) update.bandsintownAppId = bitId;
    if (Object.keys(update).length) save.mutate(update);
    else close();
  };

  return (
    <Modal open={open} onClose={close}>
      <div className="dlg">
        <h2>Settings</h2>
        <p className="muted">
          Albums and news work without any keys. Concerts need at least one of these. Keys are stored only on this computer, in{' '}
          <code>data/music-radar.db</code>.
        </p>
        <label>
          <span>
            Ticketmaster API key <StatusPill on={config.ticketmaster} />
          </span>
          <input type="password" autoComplete="off" placeholder="Paste your key" value={tmKey} onChange={(e) => setTmKey(e.target.value)} />
        </label>
        <p className="hint">
          Free: sign up at{' '}
          <ExternalLink href="https://developer-acct.ticketmaster.com/user/register">developer.ticketmaster.com</ExternalLink>, then
          copy the key shown in the example links on the API docs page (or under <i>My Apps</i>).
        </p>
        <label>
          <span>
            Bandsintown app ID <StatusPill on={config.bandsintown} />
          </span>
          <input type="password" autoComplete="off" placeholder="Optional" value={bitId} onChange={(e) => setBitId(e.target.value)} />
        </label>
        <p className="hint">Optional. Bandsintown issues app IDs to artists and partners; it adds smaller club and indie shows.</p>
        {save.error && <p className="bad">{save.error.message}</p>}
        <div className="dlg-actions">
          <button className="btn ghost" onClick={close}>
            Close
          </button>
          <button className="btn" disabled={save.isPending} onClick={submit}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
