import type { ReactNode } from 'react';
import { Avatar, Badge, ExternalLink } from './ui.tsx';
import { fmtDate, isFullDate, relDays, relMinutes } from '../lib/dates.ts';
import { place, summarize } from '../lib/summary.ts';
import type { ArtistState } from '../hooks.ts';

function Fact({ label, hot, children }: { label: string; hot?: boolean; children: ReactNode }) {
  return (
    <div className={hot ? 'fact hot' : 'fact'}>
      <span className="k">{label}</span>
      <span className="v">{children}</span>
    </div>
  );
}

const when = (date: string) => [fmtDate(date), isFullDate(date) ? relDays(date) : ''].filter(Boolean).join(' · ');

interface Props {
  state: ArtistState;
  hasEventSource: boolean;
  onOpen: () => void;
  onRefresh: () => void;
}

export function ArtistCard({ state: { artist, report, isFetching }, hasEventSource, onOpen, onRefresh }: Props) {
  const s = report && summarize(report);
  const subtitle = [artist.disambiguation, artist.country].filter(Boolean).join(' · ') || artist.type;

  return (
    <article className="card">
      <div className="card-head" onClick={onOpen}>
        <Avatar artist={artist} />
        <div>
          <div className="name">{artist.name}</div>
          <div className="dis">{subtitle}</div>
        </div>
      </div>

      <div className="facts">
        {!s || !report ? (
          <>
            <div className="loading-line" />
            <div className="loading-line" style={{ width: '70%' }} />
            <div className="loading-line" style={{ width: '50%' }} />
          </>
        ) : (
          <>
            {s.upcoming[0] && (
              <Fact label="Upcoming" hot>
                <b>{s.upcoming[0].title}</b> <Badge>{s.upcoming[0].type}</Badge>
                <br />
                <span className="muted">{when(s.upcoming[0].date)}</span>
              </Fact>
            )}
            <Fact label="Latest">
              {s.latestAlbum ? (
                <>
                  <b>{s.latestAlbum.title}</b> <Badge>{s.latestAlbum.type}</Badge>
                  <br />
                  <span className="muted">{when(s.latestAlbum.date)}</span>
                </>
              ) : (
                <span className="muted">No releases found</span>
              )}
            </Fact>
            {s.newSingle && (
              <Fact label="New track">
                <b>{s.newSingle.title}</b>
                <br />
                <span className="muted">{when(s.newSingle.date)}</span>
              </Fact>
            )}
            <Fact label="Next show" hot={!!s.nextShow}>
              {s.nextShow ? (
                <>
                  <b>{fmtDate(s.nextShow.date)}</b> · {place(s.nextShow)}
                  <br />
                  <span className="muted">
                    {s.nextShow.venue}
                    {s.shows.length > 1 && ` · +${s.shows.length - 1} more`}
                  </span>
                </>
              ) : (
                <span className="muted">{hasEventSource ? 'No dates announced' : 'Needs API key (Settings)'}</span>
              )}
            </Fact>
            {report.news[0] && (
              <Fact label="News">
                <ExternalLink href={report.news[0].url}>{report.news[0].title}</ExternalLink>
              </Fact>
            )}
          </>
        )}
      </div>

      <div className="card-foot">
        <span>{isFetching || !report ? 'Checking sources…' : `Checked ${relMinutes(report.fetchedAt)}`}</span>
        <span>
          <button className="icon-btn" title="Refresh" disabled={isFetching} onClick={onRefresh}>
            ↻
          </button>
          <button className="icon-btn" title="Details" onClick={onOpen}>
            ⤢
          </button>
        </span>
      </div>
    </article>
  );
}
