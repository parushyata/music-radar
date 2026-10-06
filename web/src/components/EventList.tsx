import { Fragment } from 'react';
import { ExternalLink } from './ui.tsx';
import { MONTHS, parseDate, relDays } from '../lib/dates.ts';
import { place } from '../lib/summary.ts';
import type { ShowEvent } from '../../../shared/types.ts';

function EventRow({ event: e, artistName }: { event: ShowEvent; artistName?: string }) {
  const d = parseDate(e.date);
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const details = [place(e), e.time, relDays(e.date)].filter(Boolean).join(' · ');
  return (
    <div className="row">
      <div className="datebox">
        <div className="m">{MONTHS[d.getUTCMonth()]}</div>
        <div className="dd">{d.getUTCDate()}</div>
        <div className="wd">{weekday}</div>
      </div>
      <div className="main">
        <div className="t">
          {artistName && `${artistName} · `}
          {e.venue || e.title}
        </div>
        <div className="s">
          {details}
          {e.status && e.status !== 'onsale' && <b> · {e.status}</b>}
        </div>
      </div>
      <div className="actions srcs">
        {e.sources.map((s) => (
          <ExternalLink key={s.name} href={s.url} className="btn ghost">
            Tickets · {s.name}
          </ExternalLink>
        ))}
      </div>
    </div>
  );
}

/** Shows sorted by date with a heading for each month. */
export function EventList({ items }: { items: { event: ShowEvent; artistName?: string }[] }) {
  return (
    <div className="rows">
      {items.map(({ event, artistName }, i) => {
        const month = event.date.slice(0, 7);
        const newMonth = i === 0 || items[i - 1].event.date.slice(0, 7) !== month;
        return (
          <Fragment key={`${artistName}|${event.date}|${event.city}|${event.venue}`}>
            {newMonth && (
              <div className="month">
                {MONTHS[+month.slice(5) - 1]} {month.slice(0, 4)}
              </div>
            )}
            <EventRow event={event} artistName={artistName} />
          </Fragment>
        );
      })}
    </div>
  );
}
