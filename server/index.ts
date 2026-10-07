import path from 'node:path';
import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { artistsRepo, manualArtistsRepo, manualReportsRepo, reportsRepo } from './db.ts';
import { configStatus, updateConfig } from './config.ts';
import { addManualArtist, followArtist, followMany, updateManualArtist } from './artists.ts';
import { getReport } from './report.ts';
import { searchArtists } from './sources/musicbrainz.ts';
import type { ArtistWithReport, ConfigUpdate, FollowedArtist, ManualArtistInput } from '../shared/types.ts';

const PORT = Number(process.env.PORT) || 4321;
const HOST = process.env.HOST || '127.0.0.1';

/** Artist ids are UUIDs, so one lookup across both tables is unambiguous. */
const findArtist = (id: string): FollowedArtist | undefined => artistsRepo.get(id) ?? manualArtistsRepo.get(id);

function readManualInput(body: Partial<ManualArtistInput>): ManualArtistInput | null {
  if (!body.name?.trim()) return null;
  return { name: body.name, disambiguation: body.disambiguation, links: Array.isArray(body.links) ? body.links.map(String) : [] };
}

const api = new Hono()
  .get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    return c.json(q ? await searchArtists(q) : []);
  })

  .get('/config', (c) => c.json(configStatus()))
  .post('/config', async (c) => {
    updateConfig(await c.req.json<ConfigUpdate>());
    // New keys → re-check every artist.
    reportsRepo.clear();
    manualReportsRepo.clear();
    return c.json(configStatus());
  })

  .get('/artists', (c) => {
    const reports = reportsRepo.all();
    const manualReports = manualReportsRepo.all();
    const list: ArtistWithReport[] = [
      ...artistsRepo.list().map((a) => ({ ...a, report: reports.get(a.id) ?? null })),
      ...manualArtistsRepo.list().map((a) => ({ ...a, report: manualReports.get(a.id) ?? null })),
    ];
    return c.json(list.sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' })));
  })
  .post('/artists', async (c) => {
    const { mbid } = await c.req.json<{ mbid?: string }>();
    if (!mbid) return c.json({ error: 'mbid required' }, 400);
    return c.json(await followArtist(mbid));
  })
  .post('/manual-artists', async (c) => {
    const input = readManualInput(await c.req.json());
    if (!input) return c.json({ error: 'name required' }, 400);
    return c.json(await addManualArtist(input));
  })
  .put('/manual-artists/:id', async (c) => {
    const artist = manualArtistsRepo.get(c.req.param('id'));
    if (!artist) return c.json({ error: 'Artist not found' }, 404);
    const input = readManualInput(await c.req.json());
    if (!input) return c.json({ error: 'name required' }, 400);
    const clash = manualArtistsRepo.getByName(input.name.trim());
    if (clash && clash.id !== artist.id) return c.json({ error: `${clash.name} is already in your manual list` }, 409);
    return c.json(await updateManualArtist(artist, input));
  })
  .post('/artists/bulk', async (c) => {
    const { names = [] } = await c.req.json<{ names?: string[] }>();
    const clean = names.map((s) => String(s).trim()).filter(Boolean).slice(0, 100);
    return c.json(await followMany(clean));
  })
  .delete('/artists/:id', (c) => {
    const artist = findArtist(c.req.param('id'));
    if (!artist) return c.json({ error: 'Artist not found' }, 404);
    if (artist.mbid === null) manualArtistsRepo.remove(artist.id);
    else artistsRepo.remove(artist.id);
    return c.json({ ok: true });
  })
  .get('/artists/:id/report', async (c) => {
    const artist = findArtist(c.req.param('id'));
    if (!artist) return c.json({ error: 'Artist not found' }, 404);
    return c.json(await getReport(artist, c.req.query('refresh') === '1'));
  });

const app = new Hono();
app.route('/api', api);
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message }, 500);
});

// In production the server also hosts the built React app; in dev Vite serves it.
const distDir = path.join(import.meta.dirname, '..', 'dist');
if (process.env.NODE_ENV === 'production') {
  if (!existsSync(distDir)) {
    console.error('No dist/ folder — run `npm run build` first.');
    process.exit(1);
  }
  const root = path.relative(process.cwd(), distDir);
  app.use('/*', serveStatic({ root }));
  app.get('*', serveStatic({ path: path.join(root, 'index.html') }));
}

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`Music Radar API on http://localhost:${PORT}`);
});
