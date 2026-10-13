// Cloudflare Worker: the JSON API, Google sign-in, and the background refresh.
// The React app itself is served from dist/ by Workers static assets (wrangler.jsonc).
import { Hono } from 'hono';
import { authRoutes, requireUser, type AppEnv } from './auth.ts';
import { artistsRepo, followedListJson, manualArtistsRepo } from './db.ts';
import { addManualArtist, followArtist, followMany, updateManualArtist } from './artists.ts';
import { buildReport } from './report.ts';
import { refreshStalest } from './refresh.ts';
import { searchArtists } from './sources/musicbrainz.ts';
import { BULK_CHUNK, type ConfigStatus, type FollowedArtist, type ManualArtistInput, type Me } from '../shared/types.ts';
import type { Env } from './env.ts';

function readManualInput(body: Partial<ManualArtistInput>): ManualArtistInput | null {
  if (!body.name?.trim()) return null;
  return { name: body.name, disambiguation: body.disambiguation, links: Array.isArray(body.links) ? body.links.map(String) : [] };
}

/** One of this user's artists, MusicBrainz or manual. Ids are UUIDs, so checking both tables is unambiguous. */
async function findFollowed(db: D1Database, userId: string, id: string): Promise<FollowedArtist | null> {
  return (await artistsRepo(db).getFollowed(userId, id)) ?? (await manualArtistsRepo(db).get(userId, id));
}

const api = new Hono<AppEnv>()
  .use(requireUser)
  .get('/me', (c) => {
    const { email, name, picture } = c.get('user');
    return c.json<Me>({ email, name, picture });
  })
  .get('/config', (c) => c.json<ConfigStatus>({ ticketmaster: !!c.env.TICKETMASTER_API_KEY, bandsintown: !!c.env.BANDSINTOWN_APP_ID }))
  .get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    return c.json(q ? await searchArtists(q) : []);
  })

  .get('/artists', async (c) => c.body(await followedListJson(c.env.DB, c.get('user').id), 200, { 'Content-Type': 'application/json' }))
  .post('/artists', async (c) => {
    const { mbid } = await c.req.json<{ mbid?: string }>();
    if (!mbid) return c.json({ error: 'mbid required' }, 400);
    return c.json(await followArtist(c.env.DB, c.get('user').id, mbid));
  })
  .post('/artists/bulk', async (c) => {
    const { names = [] } = await c.req.json<{ names?: string[] }>();
    const clean = names.map((s) => String(s).trim()).filter(Boolean);
    if (clean.length > BULK_CHUNK) return c.json({ error: `Send at most ${BULK_CHUNK} names per request` }, 400);
    return c.json(await followMany(c.env.DB, c.get('user').id, clean));
  })
  .post('/manual-artists', async (c) => {
    const input = readManualInput(await c.req.json());
    if (!input) return c.json({ error: 'name required' }, 400);
    return c.json(await addManualArtist(c.env.DB, c.get('user').id, input));
  })
  .put('/manual-artists/:id', async (c) => {
    const userId = c.get('user').id;
    const repo = manualArtistsRepo(c.env.DB);
    const artist = await repo.get(userId, c.req.param('id'));
    if (!artist) return c.json({ error: 'Artist not found' }, 404);
    const input = readManualInput(await c.req.json());
    if (!input) return c.json({ error: 'name required' }, 400);
    const clash = await repo.getByName(userId, input.name.trim());
    if (clash && clash.id !== artist.id) return c.json({ error: `${clash.name} is already in your manual list` }, 409);
    return c.json(await updateManualArtist(c.env.DB, userId, artist, input));
  })
  .delete('/artists/:id', async (c) => {
    const userId = c.get('user').id;
    const artist = await findFollowed(c.env.DB, userId, c.req.param('id'));
    if (!artist) return c.json({ error: 'Artist not found' }, 404);
    if (artist.mbid === null) await manualArtistsRepo(c.env.DB).remove(userId, artist.id);
    else await artistsRepo(c.env.DB).unfollow(userId, artist.id);
    return c.json({ ok: true });
  })
  // ↻ on an artist: check every source now. Reports are shared, so this refreshes it for everyone.
  .post('/artists/:id/refresh', async (c) => {
    const artist = await findFollowed(c.env.DB, c.get('user').id, c.req.param('id'));
    if (!artist) return c.json({ error: 'Artist not found' }, 404);
    return c.json(await buildReport(c.env, artist));
  });

const app = new Hono<AppEnv>();
app.route('/auth', authRoutes);
app.route('/api', api);
app.notFound((c) => c.json({ error: 'Not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(refreshStalest(env, new Date(controller.scheduledTime)));
  },
} satisfies ExportedHandler<Env>;
