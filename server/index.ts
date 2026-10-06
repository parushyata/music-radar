import path from 'node:path';
import { existsSync } from 'node:fs';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { artistsRepo, reportsRepo } from './db.ts';
import { configStatus, updateConfig } from './config.ts';
import { followArtist, followMany } from './artists.ts';
import { getReport } from './report.ts';
import { searchArtists } from './sources/musicbrainz.ts';
import type { ArtistWithReport, ConfigUpdate } from '../shared/types.ts';

const PORT = Number(process.env.PORT) || 4321;
const HOST = process.env.HOST || '127.0.0.1';

const api = new Hono()
  .get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    return c.json(q ? await searchArtists(q) : []);
  })

  .get('/config', (c) => c.json(configStatus()))
  .post('/config', async (c) => {
    updateConfig(await c.req.json<ConfigUpdate>());
    reportsRepo.clear(); // new keys → re-check every artist
    return c.json(configStatus());
  })

  .get('/artists', (c) => {
    const reports = reportsRepo.all();
    const list: ArtistWithReport[] = artistsRepo.list().map((a) => ({ ...a, report: reports.get(a.id) ?? null }));
    return c.json(list);
  })
  .post('/artists', async (c) => {
    const { mbid } = await c.req.json<{ mbid?: string }>();
    if (!mbid) return c.json({ error: 'mbid required' }, 400);
    return c.json(await followArtist(mbid));
  })
  .post('/artists/bulk', async (c) => {
    const { names = [] } = await c.req.json<{ names?: string[] }>();
    const clean = names.map((s) => String(s).trim()).filter(Boolean).slice(0, 100);
    return c.json(await followMany(clean));
  })
  .delete('/artists/:id', (c) => {
    const artist = artistsRepo.get(c.req.param('id'));
    if (!artist) return c.json({ error: 'Artist not found' }, 404);
    artistsRepo.remove(artist.id);
    return c.json({ ok: true });
  })
  .get('/artists/:id/report', async (c) => {
    const artist = artistsRepo.get(c.req.param('id'));
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
