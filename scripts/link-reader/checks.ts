// The link reader's rules, as plain functions with no I/O, so they're easy to test (checks.test.ts).
import { AI_SOURCE_PREFIX, type ArtistLink, type Report, type ReleaseFinding, type ShowFinding } from '../../shared/types.ts';

// Sites that need a login, block automated readers (bandsintown) or need JavaScript to show anything (soundcloud),
// or only list releases the other sources already have.
const SKIP_DOMAINS = [
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com',
  'spotify.com', 'apple.com', 'deezer.com', 'tidal.com', 'soundcloud.com', 'bandsintown.com',
  'discogs.com', 'wikidata.org', 'wikipedia.org', 'last.fm', 'allmusic.com',
];

export function isReadable(link: ArtistLink): boolean {
  let host: string;
  try {
    const url = new URL(link.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false; // mailto:, tel:
    host = url.hostname;
  } catch {
    return false; // not a valid URL
  }
  return !SKIP_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/**
 * True if the report already has an upcoming release or show from a source other than the link reader.
 * Those artists are skipped: the regular sources cover them.
 */
export function hasUpcoming(report: Report | null, today: string): boolean {
  if (!report) return false;
  const fromOthers = (sources: { name: string }[]) => sources.some((s) => !s.name.startsWith(AI_SOURCE_PREFIX));
  return (
    report.releases.some((r) => r.upcoming && fromOthers(r.sources)) ||
    report.events.some((e) => e.date >= today && fromOthers(e.sources))
  );
}

/**
 * The same page written differently should match: http/https, www., a trailing slash, #anchors.
 * WebFetch follows redirects, so the agent may cite https://ohdaughter.com/ after opening http://www.ohdaughter.com.
 */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    return `${host}${url.pathname.replace(/\/+$/, '')}${url.search}`;
  } catch {
    return raw.trim().toLowerCase();
  }
}

const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RELEASE_DATE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

/** A real calendar date in one of the RELEASE_DATE forms (rejects 2026-02-30 and 2026-13). */
function validDate(date: string): boolean {
  if (!RELEASE_DATE.test(date)) return false;
  const [y, m = 1, d = 1] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d;
}

export interface Dropped {
  kind: 'release' | 'show';
  finding: ReleaseFinding | ShowFinding;
  reason: string;
}

export interface Checked {
  releases: ReleaseFinding[];
  shows: ShowFinding[];
  dropped: Dropped[];
}

/**
 * Don't trust the agent's answer; check it against what it actually did.
 * A finding is kept only if it cites a page the agent opened, quotes it, and has a valid future date.
 * Release dates follow mergeReleases (upcoming = after today); shows follow mergeEvents (today counts).
 */
export function checkFindings(
  found: { releases: ReleaseFinding[]; shows: ShowFinding[] },
  fetchedUrls: string[],
  today: string,
): Checked {
  const fetched = new Set(fetchedUrls.map(normalizeUrl));
  const result: Checked = { releases: [], shows: [], dropped: [] };
  const seen = new Set<string>();

  const problem = (f: ReleaseFinding | ShowFinding): string | null => {
    if (!fetched.has(normalizeUrl(f.source_url))) return `source ${f.source_url} wasn't opened`;
    if (!f.quote.trim()) return 'no quote from the page';
    if (!validDate(f.date)) return `invalid date "${f.date}"`;
    return null;
  };

  for (const r of found.releases) {
    const reason =
      problem(r) ?? (!r.title.trim() ? 'no title' : r.date <= today ? `date ${r.date} isn't after today` : null);
    const key = `release|${r.title.trim().toLowerCase()}|${r.date}`;
    if (reason) result.dropped.push({ kind: 'release', finding: r, reason });
    else if (!seen.has(key)) (seen.add(key), result.releases.push(r));
  }
  for (const s of found.shows) {
    const reason =
      problem(s) ??
      (!FULL_DATE.test(s.date) ? `show date "${s.date}" needs a day` : !s.city.trim() ? 'no city' : s.date < today ? `date ${s.date} has passed` : null);
    const key = `show|${s.date}|${s.city.trim().toLowerCase()}`;
    if (reason) result.dropped.push({ kind: 'show', finding: s, reason });
    else if (!seen.has(key)) (seen.add(key), result.shows.push(s));
  }
  return result;
}
