// Cloudflare D1 (SQLite). Schema: migrations/0001_init.sql.
// Artists and their reports are shared between users; follows and manual artists belong to one user.
import type { Artist, ArtistLink, ManualArtist, Report } from '../shared/types.ts';

type Row = Record<string, unknown>;

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

const links = (r: Row): ArtistLink[] => JSON.parse(r.links as string);

function toArtist(r: Row): Artist {
  return {
    id: r.id as string,
    mbid: r.mbid as string,
    name: r.name as string,
    disambiguation: r.disambiguation as string,
    country: r.country as string,
    type: r.type as string,
    deezerId: (r.deezer_id as number | null) ?? null,
    itunesId: (r.itunes_id as number | null) ?? null,
    image: (r.image as string | null) ?? null,
    links: links(r),
    addedAt: r.added_at as string,
  };
}

function toManualArtist(r: Row): ManualArtist {
  return {
    id: r.id as string,
    mbid: null,
    name: r.name as string,
    disambiguation: r.disambiguation as string,
    country: '',
    type: '',
    deezerId: (r.deezer_id as number | null) ?? null,
    itunesId: (r.itunes_id as number | null) ?? null,
    image: (r.image as string | null) ?? null,
    links: links(r),
    addedAt: r.added_at as string,
  };
}

const toUser = (r: Row): User => ({
  id: r.id as string,
  email: r.email as string,
  name: r.name as string,
  picture: (r.picture as string | null) ?? null,
});

export function usersRepo(db: D1Database) {
  return {
    /** Signs in by Google account, or claims a row the local import created for this email. */
    async upsertFromGoogle(g: { sub: string; email: string; name: string; picture: string | null }): Promise<User> {
      const existing =
        (await db.prepare('SELECT * FROM users WHERE google_sub = ?').bind(g.sub).first<Row>()) ??
        (await db.prepare('SELECT * FROM users WHERE email = ? AND google_sub IS NULL').bind(g.email).first<Row>());
      if (existing) {
        await db
          .prepare('UPDATE users SET google_sub = ?, email = ?, name = ?, picture = ? WHERE id = ?')
          .bind(g.sub, g.email, g.name, g.picture, existing.id)
          .run();
        return { id: existing.id as string, email: g.email, name: g.name, picture: g.picture };
      }
      const user: User = { id: crypto.randomUUID(), email: g.email, name: g.name, picture: g.picture };
      await db
        .prepare('INSERT INTO users (id, google_sub, email, name, picture, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(user.id, g.sub, g.email, g.name, g.picture, new Date().toISOString())
        .run();
      return user;
    },
    /** Local development sign-in (DEV_LOGIN): creates the user by email. */
    async upsertByEmail(email: string): Promise<User> {
      const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<Row>();
      if (existing) return toUser(existing);
      const user: User = { id: crypto.randomUUID(), email, name: email.split('@')[0], picture: null };
      await db
        .prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)')
        .bind(user.id, email, user.name, new Date().toISOString())
        .run();
      return user;
    },
  };
}

export function sessionsRepo(db: D1Database) {
  return {
    create: (tokenHash: string, userId: string, expiresAt: Date) =>
      db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(tokenHash, userId, expiresAt.toISOString()).run(),
    async userFor(tokenHash: string): Promise<User | null> {
      const r = await db
        .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
        .bind(tokenHash, new Date().toISOString())
        .first<Row>();
      return r ? toUser(r) : null;
    },
    remove: (tokenHash: string) => db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run(),
    removeExpired: () => db.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(new Date().toISOString()).run(),
    removeAllForUser: (userId: string) => db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run(),
  };
}

export function artistsRepo(db: D1Database) {
  return {
    async getByMbid(mbid: string): Promise<Artist | null> {
      const r = await db.prepare('SELECT * FROM artists WHERE mbid = ?').bind(mbid).first<Row>();
      return r ? toArtist(r) : null;
    },
    /** An artist this user follows, or null. */
    async getFollowed(userId: string, id: string): Promise<Artist | null> {
      const r = await db
        .prepare('SELECT a.* FROM artists a JOIN user_artists ua ON ua.artist_id = a.id WHERE ua.user_id = ? AND a.id = ?')
        .bind(userId, id)
        .first<Row>();
      return r ? toArtist(r) : null;
    },
    insert: (a: Artist) =>
      db
        .prepare(`INSERT INTO artists (id, mbid, name, disambiguation, country, type, deezer_id, itunes_id, image, links, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(a.id, a.mbid, a.name, a.disambiguation, a.country, a.type, a.deezerId, a.itunesId, a.image, JSON.stringify(a.links), a.addedAt)
        .run(),
    /** Returns false when the user already followed it. */
    async follow(userId: string, artistId: string): Promise<boolean> {
      const r = await db
        .prepare('INSERT OR IGNORE INTO user_artists (user_id, artist_id, added_at) VALUES (?, ?, ?)')
        .bind(userId, artistId, new Date().toISOString())
        .run();
      return r.meta.changes > 0;
    },
    /** Unfollow; an artist nobody follows any more is deleted along with its report. */
    async unfollow(userId: string, artistId: string): Promise<void> {
      await db.batch([
        db.prepare('DELETE FROM user_artists WHERE user_id = ? AND artist_id = ?').bind(userId, artistId),
        db.prepare('DELETE FROM artists WHERE id = ? AND NOT EXISTS (SELECT 1 FROM user_artists WHERE artist_id = ?)').bind(artistId, artistId),
      ]);
    },
  };
}

export function manualArtistsRepo(db: D1Database) {
  const fields = (a: ManualArtist) => [a.name, a.disambiguation, a.deezerId, a.itunesId, a.image, JSON.stringify(a.links)];
  return {
    async get(userId: string, id: string): Promise<ManualArtist | null> {
      const r = await db.prepare('SELECT * FROM manual_artists WHERE user_id = ? AND id = ?').bind(userId, id).first<Row>();
      return r ? toManualArtist(r) : null;
    },
    async getByName(userId: string, name: string): Promise<ManualArtist | null> {
      const r = await db.prepare('SELECT * FROM manual_artists WHERE user_id = ? AND name = ?').bind(userId, name).first<Row>();
      return r ? toManualArtist(r) : null;
    },
    insert: (userId: string, a: ManualArtist) =>
      db
        .prepare(`INSERT INTO manual_artists (name, disambiguation, deezer_id, itunes_id, image, links, id, user_id, added_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(...fields(a), a.id, userId, a.addedAt)
        .run(),
    /** Saves edits and drops the cached report so it's rebuilt with the new details. */
    update: (userId: string, a: ManualArtist) =>
      db.batch([
        db
          .prepare(`UPDATE manual_artists SET name = ?, disambiguation = ?, deezer_id = ?, itunes_id = ?, image = ?, links = ?
            WHERE id = ? AND user_id = ?`)
          .bind(...fields(a), a.id, userId),
        db.prepare('DELETE FROM manual_reports WHERE artist_id = ?').bind(a.id),
      ]),
    remove: (userId: string, id: string) => db.prepare('DELETE FROM manual_artists WHERE user_id = ? AND id = ?').bind(userId, id).run(),
  };
}

export type ReportTable = 'reports' | 'manual_reports';

export function reportsRepo(db: D1Database, table: ReportTable) {
  return {
    async get(artistId: string): Promise<Report | null> {
      const r = await db.prepare(`SELECT data FROM ${table} WHERE artist_id = ?`).bind(artistId).first<Row>();
      return r ? (JSON.parse(r.data as string) as Report) : null;
    },
    save: (report: Report) =>
      db
        .prepare(`INSERT INTO ${table} (artist_id, fetched_at, data) VALUES (?, ?, ?)
          ON CONFLICT(artist_id) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data`)
        .bind(report.artistId, report.fetchedAt, JSON.stringify(report))
        .run(),
  };
}

/**
 * Everything one user follows, with cached reports, as a ready-made JSON string.
 * Reports are stored as JSON already; splicing them in instead of parsing and re-serialising
 * keeps this within the free plan's CPU budget even for hundreds of artists.
 */
export async function followedListJson(db: D1Database, userId: string): Promise<string> {
  const [mb, manual] = await db.batch<Row>([
    db
      .prepare(`SELECT a.*, r.data AS report FROM artists a
        JOIN user_artists ua ON ua.artist_id = a.id LEFT JOIN reports r ON r.artist_id = a.id
        WHERE ua.user_id = ?`)
      .bind(userId),
    db
      .prepare('SELECT m.*, r.data AS report FROM manual_artists m LEFT JOIN manual_reports r ON r.artist_id = m.id WHERE m.user_id = ?')
      .bind(userId),
  ]);
  const items = [
    ...mb.results.map((r) => ({ artist: toArtist(r), report: (r.report as string | null) ?? 'null' })),
    ...manual.results.map((r) => ({ artist: toManualArtist(r), report: (r.report as string | null) ?? 'null' })),
  ].sort((x, y) => x.artist.name.localeCompare(y.artist.name, undefined, { sensitivity: 'base' }));
  // Each item is an ArtistWithReport: the artist's fields plus "report".
  return `[${items.map(({ artist, report }) => `${JSON.stringify(artist).slice(0, -1)},"report":${report}}`).join(',')}]`;
}

/** The followed artist (anyone's) whose report is oldest, skipping ones tried in the last hour. */
export async function stalestArtist(db: D1Database, olderThan: number): Promise<{ table: ReportTable; artist: Artist | ManualArtist } | null> {
  const retryAfter = Date.now() - 60 * 60_000;
  const [mb, manual] = await db.batch<Row>([
    db
      .prepare(`SELECT a.*, r.fetched_at FROM artists a LEFT JOIN reports r ON r.artist_id = a.id
        WHERE EXISTS (SELECT 1 FROM user_artists ua WHERE ua.artist_id = a.id)
          AND (r.fetched_at IS NULL OR r.fetched_at < ?)
          AND (a.refresh_attempted_at IS NULL OR a.refresh_attempted_at < ?)
        ORDER BY r.fetched_at IS NOT NULL, r.fetched_at LIMIT 1`)
      .bind(olderThan, retryAfter),
    db
      .prepare(`SELECT m.*, r.fetched_at FROM manual_artists m LEFT JOIN manual_reports r ON r.artist_id = m.id
        WHERE (r.fetched_at IS NULL OR r.fetched_at < ?)
          AND (m.refresh_attempted_at IS NULL OR m.refresh_attempted_at < ?)
        ORDER BY r.fetched_at IS NOT NULL, r.fetched_at LIMIT 1`)
      .bind(olderThan, retryAfter),
  ]);
  const a = mb.results[0];
  const m = manual.results[0];
  if (!a && !m) return null;
  const age = (r: Row) => (r.fetched_at as number | null) ?? 0;
  if (a && (!m || age(a) <= age(m))) return { table: 'reports', artist: toArtist(a) };
  return { table: 'manual_reports', artist: toManualArtist(m!) };
}

export const markRefreshAttempt = (db: D1Database, table: ReportTable, artistId: string) =>
  db
    .prepare(`UPDATE ${table === 'reports' ? 'artists' : 'manual_artists'} SET refresh_attempted_at = ? WHERE id = ?`)
    .bind(Date.now(), artistId)
    .run();
