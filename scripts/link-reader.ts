// Link reader prototype (SPEC-link-reader.md, milestone 1): asks a Claude Code agent to read an artist's own pages
// for upcoming releases and shows. Reads from the local snapshot data/music-radar-cloud.db; saves nothing.
// Usage: npm run link-reader -- "Artist name"
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ArtistLink } from '../shared/types.ts';

const TIMEOUT_MS = 5 * 60_000;

// Sites that need a login, or only list releases the other sources already have.
const SKIP_DOMAINS = [
  'instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com',
  'spotify.com', 'apple.com', 'deezer.com', 'tidal.com',
  'discogs.com', 'wikidata.org', 'wikipedia.org', 'last.fm', 'allmusic.com',
];

const ARGS = [
  '-p',
  '--model', 'sonnet',
  '--effort', 'low',
  '--tools', 'WebFetch', // it can only fetch pages: no files, no shell
  '--allowedTools', 'WebFetch', // without asking, since nobody can answer a prompt in -p mode
  '--strict-mcp-config',
  '--no-session-persistence',
  '--output-format', 'stream-json', // every step of the agent loop, one JSON object per line
  '--verbose',
];

/** One line of Claude Code's stream-json output, with only the fields used here. */
interface StreamEvent {
  type: string;
  message?: { content: { type: string; name?: string; input?: { url?: string } }[] };
  result?: string;
  num_turns?: number;
  duration_ms?: number;
}

function findArtist(db: DatabaseSync, name: string) {
  return db
    .prepare('SELECT id, name, links FROM artists WHERE name = ? COLLATE NOCASE UNION ALL SELECT id, name, links FROM manual_artists WHERE name = ? COLLATE NOCASE')
    .get(name, name) as { id: string; name: string; links: string } | undefined;
}

function isReadable(link: ArtistLink): boolean {
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

function buildPrompt(name: string, links: ArtistLink[], today: string): string {
  const linkList = links.map((link) => `- ${link.label}: ${link.url}`).join('\n');
  return `You're checking whether the artist ${name} has upcoming releases or shows. Today is ${today}.

Start from these pages:
${linkList}

Open the ones likely to have news, tour dates or releases (official website, Linktree, Bandcamp, and tour or news pages they link to). Follow links on those pages if they look relevant. Open at most 8 pages.
Only report something if a page states it; never guess dates. Only report things dated after today.
If a page can't be read, say so. It's fine to find nothing.`;
}

/** Runs the Claude Code CLI with `args`, sends `input` on stdin, and collects its output. Killed after TIMEOUT_MS. */
function runClaude(claudePath: string, args: string[], input: string, cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(claudePath, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => (clearTimeout(timer), reject(e)));
    child.on('close', (code) => (clearTimeout(timer), resolve({ code, stdout, stderr })));
    child.stdin.end(input);
  });
}

/** The pages the agent really opened: the url of every WebFetch call in the log. */
function fetchedUrls(events: StreamEvent[]): string[] {
  return events
    .filter((e) => e.type === 'assistant')
    .flatMap((e) => e.message?.content ?? [])
    .filter((block) => block.type === 'tool_use' && block.name === 'WebFetch')
    .flatMap((block) => block.input?.url ?? []);
}

// --- main ---

const name = process.argv[2]?.trim();
if (!name) {
  console.error('Usage: npm run link-reader -- "Artist name"');
  process.exit(1);
}

const dbPath = path.join(import.meta.dirname, '..', 'data', 'music-radar-cloud.db');
if (!existsSync(dbPath)) {
  console.error(`No database at ${dbPath}`);
  process.exit(1);
}
const artist = findArtist(new DatabaseSync(dbPath, { readOnly: true }), name);
if (!artist) {
  console.error(`No followed artist called "${name}"`);
  process.exit(1);
}

const links: ArtistLink[] = JSON.parse(artist.links);
const readable = links.filter(isReadable);
if (!readable.length) {
  console.log(`${artist.name}: no readable links (${links.map((l) => l.label).join(', ')})`);
  process.exit(0);
}

const today = new Date().toISOString().slice(0, 10);
const prompt = buildPrompt(artist.name, readable, today);
console.log(`${prompt}\n\nRunning the agent…`);

const out = await runClaude('claude', ARGS, prompt, process.cwd()).catch((e: Error) => {
  console.error(`Couldn't start Claude Code: ${e.message}`);
  process.exit(1);
});
if (out.code !== 0) {
  console.error(`Claude Code exited with code ${out.code}\n${out.stderr || out.stdout}`);
  process.exit(1);
}

const events: StreamEvent[] = out.stdout.trim().split('\n').map((line) => JSON.parse(line));
const result = events.find((e) => e.type === 'result');
if (!result) {
  console.error(`No result from Claude Code\n${out.stderr}`);
  process.exit(1);
}

console.log(`\nOpened: ${fetchedUrls(events).join(', ') || 'nothing'}`);
console.log(`Turns: ${result.num_turns} · ${Math.round((result.duration_ms ?? 0) / 1000)} s\n`);
console.log(result.result);
