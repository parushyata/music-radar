import { NewsList } from '../components/NewsList.tsx';
import { EmptyState } from '../components/ui.tsx';
import type { ArtistState } from '../hooks.ts';

export function NewsView({ artists }: { artists: ArtistState[] }) {
  const items = artists
    .flatMap((s) => (s.report?.news ?? []).map((item) => ({ item, artistName: s.artist.name })))
    .sort((a, b) => b.item.date.localeCompare(a.item.date));

  if (!items.length) return <EmptyState title="No news yet">Headlines will show up here once your artists are checked.</EmptyState>;
  return (
    <>
      <p className="muted intro">
        Headlines from the last 60 days that mention your artists along with words like album, tour or single. Source: Google News.
      </p>
      <NewsList items={items} />
    </>
  );
}
