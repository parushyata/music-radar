/// <reference types="vite/client" />
// Integration test: the real Worker app against a local D1 (Miniflare, in memory), no network.
import { afterAll, beforeAll, expect, test } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import worker from './worker.ts';
import type { Env } from './env.ts';

const migrations = import.meta.glob<string>('../migrations/*.sql', { query: '?raw', import: 'default', eager: true });

let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
let env: Env;

/** Runs each migration file in order. Comments are stripped first because some contain `;`. */
async function migrate(db: D1Database) {
  for (const file of Object.keys(migrations).sort()) {
    const statements = migrations[file]
      .replace(/--.*$/gm, '')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    await db.batch(statements.map((s) => db.prepare(s)));
  }
}

const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`http://localhost${path}`, init), env, proxy.ctx);

/** Signs in through /auth/dev and returns the session cookie to send back. */
async function signIn(email: string): Promise<string> {
  const res = await call(`/auth/dev?email=${encodeURIComponent(email)}`);
  expect(res.status).toBe(302);
  const cookie = res.headers.get('Set-Cookie') ?? '';
  return cookie.split(';')[0]; // "mr_session=…"
}

beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({ persist: false, remoteBindings: false, envFiles: [] });
  // Set explicitly so the test doesn't depend on whatever is in your .dev.vars.
  env = { DB: proxy.env.DB, DEV_LOGIN: 'true' };
  await migrate(env.DB);
});

afterAll(async () => {
  await proxy?.dispose();
});

test('/api/me without a session is 401', async () => {
  const res = await call('/api/me');
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'Not signed in' });
});

test('/api/me with a made-up session cookie is 401', async () => {
  const res = await call('/api/me', { headers: { Cookie: 'mr_session=not-a-real-token' } });
  expect(res.status).toBe(401);
});

test('/api/me returns the signed-in user', async () => {
  const cookie = await signIn('Ada@Example.com');
  const res = await call('/api/me', { headers: { Cookie: cookie } });
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ email: 'ada@example.com', name: 'ada', picture: null });
});

test('/auth/dev is off unless DEV_LOGIN is "true"', async () => {
  const saved = env;
  env = { DB: saved.DB };
  try {
    const res = await call('/auth/dev?email=ada@example.com');
    expect(res.status).toBe(404);
  } finally {
    env = saved;
  }
});
