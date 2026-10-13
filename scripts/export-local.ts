// One-off: copy the artists from the old local version (data/music-radar.db) into the hosted D1 database
// for one person. Writes data/import.sql; apply it with
//   npx wrangler d1 execute music-radar --remote --file data/import.sql
// Usage: npm run import-local -- you@gmail.com
// The user row is matched to your Google account by email the first time you sign in.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const email = process.argv[2]?.trim().toLowerCase();
if (!email?.includes('@')) {
  console.error('Usage: npm run import-local -- you@gmail.com');
  process.exit(1);
}
const dbPath = path.join(import.meta.dirname, '..', 'data', 'music-radar.db');
if (!existsSync(dbPath)) {
  console.error(`No local database at ${dbPath}`);
  process.exit(1);
}

type Row = Record<string, string | number | null>;
const db = new DatabaseSync(dbPath, { readOnly: true });
const rows = (sql: string) => db.prepare(sql).all() as Row[];
const hasTable = (name: string) => rows(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${name}'`).length > 0;

const q = (v: string | number | null | undefined) =>
  v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`;
const userId = `(SELECT id FROM users WHERE email = ${q(email)})`;

const sql: string[] = [
  `INSERT OR IGNORE INTO users (id, email, name, created_at) VALUES (${q(crypto.randomUUID())}, ${q(email)}, '', ${q(new Date().toISOString())});`,
];

const artists = rows('SELECT * FROM artists');
for (const a of artists) {
  // The artist may already exist in D1 (someone else follows them): then the existing row is kept.
  sql.push(
    `INSERT OR IGNORE INTO artists (id, mbid, name, disambiguation, country, type, deezer_id, itunes_id, image, links, added_at) VALUES (${[
      a.id, a.mbid, a.name, a.disambiguation, a.country, a.type, a.deezer_id, a.itunes_id, a.image, a.links, a.added_at,
    ].map(q).join(', ')});`,
    `INSERT OR IGNORE INTO user_artists (user_id, artist_id, added_at) SELECT ${userId}, id, ${q(a.added_at)} FROM artists WHERE mbid = ${q(a.mbid)};`,
  );
}
for (const r of rows('SELECT r.*, a.mbid FROM reports r JOIN artists a ON a.id = r.artist_id')) {
  sql.push(`INSERT OR IGNORE INTO reports (artist_id, fetched_at, data) SELECT id, ${q(r.fetched_at)}, ${q(r.data)} FROM artists WHERE mbid = ${q(r.mbid)};`);
}

let manual = 0;
if (hasTable('manual_artists')) {
  for (const m of rows('SELECT * FROM manual_artists')) {
    manual++;
    sql.push(
      `INSERT OR IGNORE INTO manual_artists (id, user_id, name, disambiguation, deezer_id, itunes_id, image, links, added_at) SELECT ${[
        m.id,
      ].map(q)}, ${userId}, ${[m.name, m.disambiguation, m.deezer_id, m.itunes_id, m.image, m.links, m.added_at].map(q).join(', ')};`,
    );
  }
  if (hasTable('manual_reports')) {
    for (const r of rows('SELECT * FROM manual_reports')) {
      sql.push(`INSERT OR IGNORE INTO manual_reports (artist_id, fetched_at, data) VALUES (${[r.artist_id, r.fetched_at, r.data].map(q).join(', ')});`);
    }
  }
}

const out = path.join(import.meta.dirname, '..', 'data', 'import.sql');
writeFileSync(out, `${sql.join('\n')}\n`);
console.log(`Wrote ${out}: ${artists.length} artists and ${manual} manual artists for ${email}.`);
console.log('Apply it with: npx wrangler d1 execute music-radar --remote --file data/import.sql');
