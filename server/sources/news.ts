// Google News RSS (no key): headlines about new albums, tours and announcements.
import { fetchText } from '../lib/http.ts';
import { decodeEntities, norm, stripAccents } from '../lib/text.ts';
import type { FollowedArtist, NewsItem } from '../../shared/types.ts';

// Headlines must look music-related (skips gossip that merely mentions the artist).
const MUSIC_WORDS =
  /\b(albums?|LP|EP|singles?|songs?|tracks?|tours?|touring|concerts?|gigs?|shows?|festivals?|tickets?|presale|tour dates|headlin\w*|lineup|line-up|releases?|released|new music|music video|recording|studio|perform\w*|setlist|residency|live|reunion|remix|deluxe|Grammys?)\b/i;

export async function newsFor(artist: FollowedArtist): Promise<NewsItem[]> {
  const q = `"${artist.name}" (album OR tour OR concert OR single OR announces OR festival) when:60d`;
  const xml = await fetchText(
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`,
    { headers: { Accept: 'application/rss+xml' } },
  );

  const items: NewsItem[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag: string) => decodeEntities(m[1].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '');
    const source = get('source');
    let title = get('title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));

    // Case-sensitive so common-word names (Muse, Yes, Low) skip lowercase mentions.
    if (!stripAccents(title).includes(stripAccents(artist.name))) continue;
    if (!MUSIC_WORDS.test(title)) continue;
    if (items.some((x) => norm(x.title) === norm(title))) continue;

    items.push({ title, url: get('link'), date: new Date(get('pubDate')).toISOString(), source });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
}
