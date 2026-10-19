// The agent: Claude Code (`claude -p`, on your Pro plan) reads an artist's pages with WebFetch
// and answers in JSON. Claude Code runs the agent loop; this file sets it up and reads the log.
import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import type { ArtistLink } from '../../shared/types.ts';

const TIMEOUT_MS = 5 * 60_000;
export const MAX_PAGES = 8;

const OutputSchema = z.object({
  releases: z.array(
    z.object({
      title: z.string(),
      date: z.string().describe('As precise as the page says: YYYY-MM-DD, YYYY-MM or YYYY'),
      type: z.enum(['album', 'ep', 'single', 'other']),
      source_url: z.string().describe('The page that states it, exactly as you opened it'),
      quote: z.string().describe("The words on the page that show it, copied, under 200 characters"),
    }),
  ),
  shows: z.array(
    z.object({
      date: z.string().describe('YYYY-MM-DD'),
      city: z.string(),
      country: z.string().describe('Country name, or "" if not stated'),
      venue: z.string().describe('Venue name, or "" if not stated'),
      source_url: z.string().describe('The page that states it, exactly as you opened it'),
      quote: z.string().describe("The words on the page that show it, copied, under 200 characters"),
    }),
  ),
  unreadable: z.array(z.object({ url: z.string(), reason: z.string() })),
  notes: z.string().describe('One sentence: what you looked at and what you found'),
});
export type AgentOutput = z.infer<typeof OutputSchema>;

// Claude Code's validator doesn't load the draft-2020-12 meta-schema that zod declares in `$schema` (as in Job Radar).
const { $schema: _, ...outputJsonSchema } = z.toJSONSchema(OutputSchema);

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
  '--json-schema', JSON.stringify(outputJsonSchema),
];

/** Usage limit, not logged in and the like: every later artist would fail the same way, so the run stops. */
export class AgentStopError extends Error {}

export function buildPrompt(name: string, links: ArtistLink[], today: string): string {
  const linkList = links.map((link) => `- ${link.label}: ${link.url}`).join('\n');
  return `You're checking whether the artist ${name} has upcoming releases or shows. Today is ${today}.

Start from these pages:
${linkList}

Open the ones likely to have news, tour dates or releases (official website, Linktree, Bandcamp, Songkick), and on the official website also open its tour, news and releases pages if it has them. Open at most ${MAX_PAGES} pages in total.
Only report something if a page states it; never guess or work out dates. Only report things dated after today.
For each finding give the page it's on, exactly as you opened it, and copy the words that show it.
If a page can't be read, list it under unreadable. It's fine to find nothing. Nobody can answer questions, so don't ask any.`;
}

/**
 * The `claude` command. Some shells (and launchd jobs) have a bare PATH,
 * so also look where the installer and Homebrew put it (as Job Radar does).
 */
export function findClaude(): string | null {
  const dirs = [...(process.env.PATH ?? '').split(':'), path.join(homedir(), '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  for (const dir of dirs) {
    const file = path.join(dir, 'claude');
    try {
      accessSync(file, constants.X_OK);
      return file;
    } catch {
      // not here
    }
  }
  return null;
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

/** One line of Claude Code's stream-json output, with only the fields used here. */
interface StreamEvent {
  type: string;
  subtype?: string;
  is_error?: boolean;
  message?: { content: { type: string; name?: string; input?: { url?: string } }[] };
  result?: string;
  structured_output?: unknown;
  num_turns?: number;
  duration_ms?: number;
}

/** The pages the agent really opened: the url of every WebFetch call in the log. */
function fetchedUrls(events: StreamEvent[]): string[] {
  return events
    .filter((e) => e.type === 'assistant')
    .flatMap((e) => e.message?.content ?? [])
    .filter((block) => block.type === 'tool_use' && block.name === 'WebFetch')
    .flatMap((block) => block.input?.url ?? []);
}

function parseLines(stdout: string): StreamEvent[] {
  return stdout
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as StreamEvent];
      } catch {
        return []; // not JSON: ignore
      }
    });
}

export interface AgentRun {
  output: AgentOutput;
  fetched: string[];
  turns: number;
  seconds: number;
}

/**
 * Runs the agent for one artist. Throws AgentStopError when Claude Code itself can't run,
 * and a plain Error when only this artist failed (e.g. an answer that doesn't match the schema).
 */
export async function readLinks(claudePath: string, name: string, links: ArtistLink[], today: string): Promise<AgentRun> {
  let out: Awaited<ReturnType<typeof runClaude>>;
  try {
    out = await runClaude(claudePath, ARGS, buildPrompt(name, links, today), process.cwd());
  } catch (e) {
    throw new AgentStopError(`Couldn't start Claude Code: ${(e as Error).message}`);
  }

  const events = parseLines(out.stdout);
  const result = events.find((e) => e.type === 'result');
  if (!result) {
    const detail = (out.stderr || out.stdout).trim().slice(0, 300) || `exit code ${out.code}`;
    throw new AgentStopError(`Claude Code failed: ${detail}`);
  }
  if (result.is_error || result.subtype !== 'success') {
    throw new AgentStopError(`Claude Code: ${(result.result ?? result.subtype ?? 'unknown error').slice(0, 300)}`);
  }

  const parsed = OutputSchema.safeParse(result.structured_output);
  if (!parsed.success) throw new Error(`The agent's answer didn't match the schema: ${parsed.error.message.slice(0, 300)}`);

  return {
    output: parsed.data,
    fetched: fetchedUrls(events),
    turns: result.num_turns ?? 0,
    seconds: Math.round((result.duration_ms ?? 0) / 1000),
  };
}
