import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.ts';
import { queryKeys, type ArtistState } from '../hooks.ts';
import { summarize } from '../lib/summary.ts';
import { Avatar, ExternalLink, Modal } from './ui.tsx';
import { ReleaseGrid } from './ReleaseCard.tsx';
import { EventList } from './EventList.tsx';
import { NewsList } from './NewsList.tsx';

interface Props {
  state: ArtistState | null;
  hasEventSource: boolean;
  onClose: () => void;
  onRefresh: (id: string) => void;
}

export function ArtistDialog({ state, hasEventSource, onClose, onRefresh }: Props) {
  const qc = useQueryClient();
  const unfollow = useMutation({
    mutationFn: api.unfollow,
    onSuccess: (_res, id) => {
      onClose();
      qc.removeQueries({ queryKey: queryKeys.report(id) });
      qc.invalidateQueries({ queryKey: queryKeys.artists });
    },
  });

  return (
    <Modal open={!!state} onClose={onClose} wide>
      {state && <Body state={state} hasEventSource={hasEventSource} onClose={onClose} onRefresh={onRefresh} onRemove={() => {
        if (confirm(`Stop following ${state.artist.name}?`)) unfollow.mutate(state.artist.id);
      }} />}
    </Modal>
  );
}

function Body({ state: { artist, report, isFetching }, hasEventSource, onClose, onRefresh, onRemove }: Omit<Props, 'state'> & { state: ArtistState; onRemove: () => void }) {
  const s = report && summarize(report);
  return (
    <>
      <div className="detail-head">
        <Avatar artist={artist} />
        <div className="grow">
          <h2>{artist.name}</h2>
          <div className="muted">{[artist.type, artist.disambiguation, artist.country].filter(Boolean).join(' · ')}</div>
          <div className="links">
            {artist.links.map((l) => (
              <ExternalLink key={l.label} href={l.url}>
                {l.label}
              </ExternalLink>
            ))}
          </div>
        </div>
        <button className="icon-btn close" title="Close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="detail-body">
        {!report || !s ? (
          <p className="muted">Checking sources…</p>
        ) : (
          <>
            {s.upcoming.length > 0 && (
              <>
                <div className="section-title"><h2>Upcoming releases</h2></div>
                <ReleaseGrid items={s.upcoming.map((release) => ({ release }))} />
              </>
            )}

            <div className="section-title">
              <h2>Shows</h2>
              <span className="muted">{report.events.length}</span>
            </div>
            {report.events.length ? (
              <EventList items={report.events.map((event) => ({ event }))} />
            ) : (
              <p className="muted">
                {hasEventSource ? 'No upcoming dates on connected ticketing sources.' : 'Add a Ticketmaster key in Settings to see dates.'}
              </p>
            )}

            <div className="section-title">
              <h2>Releases</h2>
              <span className="muted">newest first</span>
            </div>
            {report.releases.some((r) => !r.upcoming && r.date) ? (
              <ReleaseGrid items={report.releases.filter((r) => !r.upcoming && r.date).slice(0, 24).map((release) => ({ release }))} />
            ) : (
              <p className="muted">No releases found.</p>
            )}

            <div className="section-title"><h2>News</h2></div>
            {report.news.length ? <NewsList items={report.news.map((item) => ({ item }))} /> : <p className="muted">No recent headlines.</p>}

            <div className="sources">
              Sources:
              {report.sources.map((src) => (
                <span key={src.name} className={src.ok ? 'src' : 'src bad'} title={src.error}>
                  {src.name} · {src.ok ? src.count : 'failed'}
                </span>
              ))}
              <span className="grow" />
              <button className="btn ghost" disabled={isFetching} onClick={() => onRefresh(artist.id)}>
                {isFetching ? 'Checking…' : '↻ Refresh'}
              </button>
              <button className="btn ghost" onClick={onRemove}>
                Remove artist
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
