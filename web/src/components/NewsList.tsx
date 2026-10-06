import { ExternalLink } from './ui.tsx';
import { relDays } from '../lib/dates.ts';
import type { NewsItem } from '../../../shared/types.ts';

export function NewsList({ items }: { items: { item: NewsItem; artistName?: string }[] }) {
  return (
    <div className="rows">
      {items.map(({ item, artistName }) => (
        <ExternalLink key={item.url} href={item.url} className="news-row">
          <span className="t">{item.title}</span>
          <span className="s">
            {[artistName, item.source, relDays(item.date.slice(0, 10))].filter(Boolean).join(' · ')}
          </span>
        </ExternalLink>
      ))}
    </div>
  );
}
