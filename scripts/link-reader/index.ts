// Link reader (SPEC-link-reader.md): for artists with no upcoming releases or shows, an AI agent reads their
// own pages and the findings are saved to D1, where buildReport merges them into the artist's report.
//
//   npm run link-reader                         check up to 5 artists on the live database and save
//   npm run link-reader -- --dry-run            the same, but only print what it would save
//   npm run link-reader -- --artist "Daughter"  just this artist, even if it was checked recently
//   npm run link-reader -- --limit 2            fewer (or more) artists
//   npm run link-reader -- --db-file data/test.db   use a local SQLite copy instead of the live database
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { AgentStopError, findClaude, readLinks, type AgentRun } from './agent.ts';
import { checkFindings, hasUpcoming, isReadable, type Checked } from './checks.ts';
import { fileDb, remoteDb, type Db, type Statement } from './db.ts';
import type { ArtistLink, Report } from '../../shared/types.ts';

const DEFAULT_LIMIT = 5;
const RECHECK_AFTER_DAYS = 7;

interface Row {
  id: string;
  name: string;
  links: string;
  report: string | null;
  checked_at: number | null;
}

interface Candidate {
  id: string;
  name: string;
  links: ArtistLink[];
}

const log = (message: string) => console.log(`[${new Date().toISOString().slice(0, 16).replace('T', ' ')}] ${message}`);

// Followed artists and manual artists, with their report and last check. Rows never checked come first.
// (SQLite only allows plain column names in a UNION's ORDER BY, hence the outer SELECT.)
const CANDIDATES_SQL = `
  SELECT * FROM (
    SELECT a.id, a.name, a.links, r.data AS report, c.checked_at FROM artists a
      LEFT JOIN reports r ON r.artist_id = a.id LEFT JOIN link_checks c ON c.artist_id = a.id
      WHERE EXISTS (SELECT 1 FROM user_artists ua WHERE ua.artist_id = a.id) AND %WHERE%
    UNION ALL
    SELECT m.id, m.name, m.links, r.data AS report, c.checked_at FROM manual_artists m
      LEFT JOIN manual_reports r ON r.artist_id = m.id LEFT JOIN link_checks c ON c.artist_id = m.id
      WHERE %WHERE%
  ) ORDER BY checked_at IS NOT NULL, checked_at`;

/** Who to check: not checked for a week, has readable links, and nothing upcoming from the regular sources. */
async function pickArtists(db: Db, today: string, limit: number): Promise<Candidate[]> {
  const before = Date.now() - RECHECK_AFTER_DAYS * 86_400_000;
  const rows = await db.all<Row>(CANDIDATES_SQL.replaceAll('%WHERE%', '(c.checked_at IS NULL OR c.checked_at < ?)'), [before, before]);
  const picked: Candidate[] = [];
  for (const row of rows) {
    if (picked.length >= limit) break;
    const links = (JSON.parse(row.links) as ArtistLink[]).filter(isReadable);
    const report = row.report ? (JSON.parse(row.report) as Report) : null;
    if (links.length && !hasUpcoming(report, today)) picked.push({ id: row.id, name: row.name, links });
  }
  return picked;
}

async function findByName(db: Db, name: string): Promise<Candidate | null> {
  const [row] = await db.all<Row>(CANDIDATES_SQL.replaceAll('%WHERE%', 'name = ? COLLATE NOCASE'), [name, name]);
  return row ? { id: row.id, name: row.name, links: (JSON.parse(row.links) as ArtistLink[]).filter(isReadable) } : null;
}

/** Replace the artist's findings, record the check, and mark its report stale so the cron rebuilds it within minutes. */
function saveStatements(artistId: string, checked: Checked, run: AgentRun): Statement[] {
  const now = Date.now();
  const insert = (kind: 'release' | 'show', finding: { source_url: string }): Statement => ({
    sql: 'INSERT INTO link_findings (id, artist_id, kind, data, source_url, found_at) VALUES (?, ?, ?, ?, ?, ?)',
    params: [randomUUID(), artistId, kind, JSON.stringify(finding), finding.source_url, now],
  });
  return [
    { sql: 'DELETE FROM link_findings WHERE artist_id = ?', params: [artistId] },
    ...checked.releases.map((r) => insert('release', r)),
    ...checked.shows.map((s) => insert('show', s)),
    checkStatement(artistId, run.output.notes, run.output.unreadable),
    { sql: 'UPDATE reports SET fetched_at = 0 WHERE artist_id = ?', params: [artistId] },
    { sql: 'UPDATE manual_reports SET fetched_at = 0 WHERE artist_id = ?', params: [artistId] },
  ];
}

const checkStatement = (artistId: string, notes: string, unreadable: unknown[] = []): Statement => ({
  sql: `INSERT INTO link_checks (artist_id, checked_at, notes, unreadable) VALUES (?, ?, ?, ?)
    ON CONFLICT(artist_id) DO UPDATE SET checked_at = excluded.checked_at, notes = excluded.notes, unreadable = excluded.unreadable`,
  params: [artistId, Date.now(), notes, JSON.stringify(unreadable)],
});

function printRun(run: AgentRun, checked: Checked) {
  const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60);
  for (const r of checked.releases) console.log(`    ✓ release ${r.date}  "${r.title}" (${r.type})  ${host(r.source_url)}`);
  for (const s of checked.shows) console.log(`    ✓ show    ${s.date}  ${[s.venue, s.city, s.country].filter(Boolean).join(', ')}  ${host(s.source_url)}`);
  for (const d of checked.dropped) {
    const label = d.kind === 'release' ? `"${(d.finding as { title: string }).title}"` : d.finding.date;
    console.log(`    ✗ dropped ${d.kind} ${label}: ${d.reason}`);
  }
  for (const u of run.output.unreadable) console.log(`    · unreadable ${host(u.url)}: ${u.reason}`);
  console.log(`    notes: ${run.output.notes}`);
}

// --- main ---

const { values: opts } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    artist: { type: 'string' },
    limit: { type: 'string' },
    'db-file': { type: 'string' },
  },
});

const envFile = path.join(import.meta.dirname, '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const claude = findClaude();
if (!claude) {
  console.error('Claude Code (`claude`) is not installed or not on PATH.');
  process.exit(1);
}

const db = opts['db-file'] ? fileDb(opts['db-file']) : remoteDb();
const today = new Date().toISOString().slice(0, 10);
const dryRun = opts['dry-run'];

let artists: Candidate[];
if (opts.artist) {
  const one = await findByName(db, opts.artist);
  if (!one) {
    console.error(`No artist called "${opts.artist}" in the ${db.describe}`);
    process.exit(1);
  }
  if (!one.links.length) {
    console.log(`${one.name} has no readable links (only social or streaming sites).`);
    process.exit(0);
  }
  artists = [one];
} else {
  artists = await pickArtists(db, today, Number(opts.limit) || DEFAULT_LIMIT);
}

log(`Link reader: ${artists.length} artist(s) to check on the ${db.describe}${dryRun ? ' (dry run: nothing is saved)' : ''}`);
let found = 0;
let failed = 0;

for (const artist of artists) {
  try {
    const run = await readLinks(claude, artist.name, artist.links, today);
    const checked = checkFindings(run.output, run.fetched, today);
    found += checked.releases.length + checked.shows.length;
    log(`${artist.name}: opened ${run.fetched.length} page(s) in ${run.turns} turns, ${run.seconds} s`);
    printRun(run, checked);
    if (!dryRun) await db.batch(saveStatements(artist.id, checked, run));
  } catch (e) {
    if (e instanceof AgentStopError) {
      log(`Stopped: ${e.message}`);
      process.exit(1);
    }
    failed++;
    log(`${artist.name}: failed: ${(e as Error).message}`);
    // Record it anyway, so one broken artist doesn't take a slot every day; it's retried after a week.
    if (!dryRun) await db.batch([checkStatement(artist.id, `failed: ${(e as Error).message.slice(0, 200)}`)]);
  }
}

log(`Done: ${found} finding(s) kept${failed ? `, ${failed} artist(s) failed` : ''}.`);
