// Types shared by the API server and the React app.

/** Reports older than this are refreshed in the background (one artist a minute; see server/refresh.ts). */
export const REPORT_TTL_MS = 12 * 60 * 60 * 1000;

/** "Add many" sends names in groups this size: each takes ~5 outside requests and a request may make 50. */
export const BULK_CHUNK = 5;

export interface Me {
  email: string;
  name: string;
  picture: string | null;
}

export interface SourceLink {
  name: string;
  url: string;
  /** For link-reader findings: the words on the page it came from. */
  quote?: string;
}

/** Source names of items the link reader (an AI agent) found on artists' own pages start with this. */
export const AI_SOURCE_PREFIX = 'AI · ';

/** What the link reader stores per finding (link_findings.data). */
export interface ReleaseFinding {
  title: string;
  /** YYYY, YYYY-MM or YYYY-MM-DD */
  date: string;
  type: 'album' | 'ep' | 'single' | 'other';
  source_url: string;
  quote: string;
}

export interface ShowFinding {
  /** YYYY-MM-DD */
  date: string;
  city: string;
  country: string;
  venue: string;
  source_url: string;
  quote: string;
}

export interface ArtistLink {
  label: string;
  url: string;
}

export interface Artist {
  id: string;
  mbid: string;
  name: string;
  disambiguation: string;
  country: string;
  type: string;
  deezerId: number | null;
  itunesId: number | null;
  image: string | null;
  links: ArtistLink[];
  addedAt: string;
}

/** An artist MusicBrainz doesn't list, added by hand and kept in its own table. */
export interface ManualArtist extends Omit<Artist, 'mbid'> {
  mbid: null;
}

/** Everyone the app tracks; `mbid === null` tells the two kinds apart. */
export type FollowedArtist = Artist | ManualArtist;

export interface ManualArtistInput {
  name: string;
  /** Short note shown under the name, e.g. "London singer-songwriter" */
  disambiguation?: string;
  links: string[];
}

export type ArtistWithReport = FollowedArtist & {
  report: Report | null;
};

export interface ArtistCandidate {
  mbid: string;
  name: string;
  disambiguation: string;
  country: string;
  type: string;
  score: number;
  aliases: string[];
  tags: string[];
}

/** album | ep | single | live | compilation | other MusicBrainz secondary types */
export type ReleaseType = string;

export interface Release {
  title: string;
  /** YYYY, YYYY-MM or YYYY-MM-DD */
  date: string;
  type: ReleaseType;
  cover: string | null;
  sources: SourceLink[];
  upcoming: boolean;
}

export interface ShowEvent {
  date: string;
  time: string;
  title: string;
  venue: string;
  city: string;
  region: string;
  country: string;
  status: string;
  sources: SourceLink[];
}

export interface NewsItem {
  title: string;
  url: string;
  date: string;
  source: string;
}

export interface SourceStatus {
  name: string;
  ok: boolean;
  count?: number;
  error?: string;
}

export interface Report {
  artistId: string;
  fetchedAt: number;
  releases: Release[];
  events: ShowEvent[];
  news: NewsItem[];
  sources: SourceStatus[];
}

export interface ConfigStatus {
  ticketmaster: boolean;
  bandsintown: boolean;
}


export type BulkResult =
  | { name: string; ok: true; existed: boolean; id: string; matched: string; disambiguation: string }
  | { name: string; ok: false; error: string };
