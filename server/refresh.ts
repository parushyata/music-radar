// Background refresh, run by the every-minute cron trigger (wrangler.jsonc).
// One artist per run keeps each run inside the free plan's limits (10 ms CPU, 50 outside requests)
// and MusicBrainz's one-request-a-second rule. That's 1,440 refreshes a day: with reports kept
// 12 hours, enough for about 700 followed artists across all users.
import { markRefreshAttempt, sessionsRepo, stalestArtist } from './db.ts';
import { buildReport } from './report.ts';
import { REPORT_TTL_MS } from '../shared/types.ts';
import type { Env } from './env.ts';

export async function refreshStalest(env: Env, now: Date): Promise<void> {
  const next = await stalestArtist(env.DB, now.getTime() - REPORT_TTL_MS);
  if (next) {
    // Recorded first, so an artist whose refresh keeps crashing waits an hour instead of blocking the queue.
    await markRefreshAttempt(env.DB, next.table, next.artist.id);
    await buildReport(env, next.artist);
  }
  if (now.getUTCMinutes() === 0) await sessionsRepo(env.DB).removeExpired();
}
