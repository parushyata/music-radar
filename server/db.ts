// SQLite storage via Node's built-in driver — a single file in data/, no server to run.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Artist, Report } from '../shared/types.ts';

const DATA_DIR = process.env.DATA_DIR ?? path.join(import.meta.dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'music-radar.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS artists (
    id             TEXT PRIMARY KEY,
    mbid           TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    disambiguation TEXT NOT NULL DEFAULT '',
    country        TEXT NOT NULL DEFAULT '',
    type           TEXT NOT NULL DEFAULT '',
    deezer_id      INTEGER,
    itunes_id      INTEGER,
    image          TEXT,
    links          TEXT NOT NULL DEFAULT '[]',
    added_at       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Cached aggregation results, one row per artist.
  CREATE TABLE IF NOT EXISTS reports (
    artist_id  TEXT PRIMARY KEY REFERENCES artists(id) ON DELETE CASCADE,
    fetched_at INTEGER NOT NULL,
    data       TEXT NOT NULL
  );
`);

type Row = Record<string, unknown>;

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
    links: JSON.parse(r.links as string),
    addedAt: r.added_at as string,
  };
}

const stmt = {
  listArtists: db.prepare('SELECT * FROM artists ORDER BY name COLLATE NOCASE'),
  getArtist: db.prepare('SELECT * FROM artists WHERE id = ?'),
  getArtistByMbid: db.prepare('SELECT * FROM artists WHERE mbid = ?'),
  insertArtist: db.prepare(`
    INSERT INTO artists (id, mbid, name, disambiguation, country, type, deezer_id, itunes_id, image, links, added_at)
    VALUES (:id, :mbid, :name, :disambiguation, :country, :type, :deezerId, :itunesId, :image, :links, :addedAt)`),
  deleteArtist: db.prepare('DELETE FROM artists WHERE id = ?'),
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  setSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  getReport: db.prepare('SELECT data FROM reports WHERE artist_id = ?'),
  listReports: db.prepare('SELECT artist_id, data FROM reports'),
  upsertReport: db.prepare(`
    INSERT INTO reports (artist_id, fetched_at, data) VALUES (?, ?, ?)
    ON CONFLICT(artist_id) DO UPDATE SET fetched_at = excluded.fetched_at, data = excluded.data`),
  clearReports: db.prepare('DELETE FROM reports'),
};

export const artistsRepo = {
  list: (): Artist[] => (stmt.listArtists.all() as Row[]).map(toArtist),
  get: (id: string): Artist | undefined => {
    const row = stmt.getArtist.get(id) as Row | undefined;
    return row && toArtist(row);
  },
  getByMbid: (mbid: string): Artist | undefined => {
    const row = stmt.getArtistByMbid.get(mbid) as Row | undefined;
    return row && toArtist(row);
  },
  insert: (a: Artist): void => {
    stmt.insertArtist.run({ ...a, links: JSON.stringify(a.links) });
  },
  remove: (id: string): void => {
    stmt.deleteArtist.run(id);
  },
};

export const settingsRepo = {
  get: (key: string): string | undefined => (stmt.getSetting.get(key) as Row | undefined)?.value as string | undefined,
  set: (key: string, value: string): void => {
    stmt.setSetting.run(key, value);
  },
};

export const reportsRepo = {
  get: (artistId: string): Report | undefined => {
    const row = stmt.getReport.get(artistId) as Row | undefined;
    return row && JSON.parse(row.data as string);
  },
  all: (): Map<string, Report> =>
    new Map((stmt.listReports.all() as Row[]).map((r) => [r.artist_id as string, JSON.parse(r.data as string)])),
  save: (report: Report): void => {
    stmt.upsertReport.run(report.artistId, report.fetchedAt, JSON.stringify(report));
  },
  clear: (): void => {
    stmt.clearReports.run();
  },
};
