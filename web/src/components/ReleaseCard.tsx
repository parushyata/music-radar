import { Badge, Cover, ExternalLink } from './ui.tsx';
import { daysFromToday, fmtDate, isFullDate, relDays } from '../lib/dates.ts';
import type { Release } from '../../../shared/types.ts';

export function ReleaseCard({ release: r, artistName }: { release: Release; artistName?: string }) {
  const isNew = !r.upcoming && isFullDate(r.date) && daysFromToday(r.date) >= -30;
  return (
    <article className="rel">
      <Cover src={r.cover} />
      <div className="body">
        <div className="t">{r.title}</div>
        {artistName && <div className="a">{artistName}</div>}
        <div className="d">
          {r.upcoming ? <Badge tone="up">upcoming</Badge> : isNew && <Badge tone="new">new</Badge>}
          <Badge>{r.type}</Badge>
          <span>{fmtDate(r.date)}</span>
        </div>
        {isFullDate(r.date) && <div className="muted small">{relDays(r.date)}</div>}
        <div className="srcs">
          {r.sources.map((s) => (
            <ExternalLink key={s.name} href={s.url}>
              {s.name} ↗
            </ExternalLink>
          ))}
        </div>
      </div>
    </article>
  );
}

export function ReleaseGrid({ items }: { items: { release: Release; artistName?: string }[] }) {
  return (
    <div className="rel-grid">
      {items.map(({ release, artistName }) => (
        <ReleaseCard key={`${artistName}|${release.title}|${release.date}`} release={release} artistName={artistName} />
      ))}
    </div>
  );
}
