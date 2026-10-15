// Google sign-in (OAuth 2.0 authorization-code flow) and cookie sessions.
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import { sessionsRepo, usersRepo, type User } from './db.ts';
import type { Env } from './env.ts';

export const SESSION_COOKIE = 'mr_session';
const STATE_COOKIE = 'mr_oauth_state';
const SESSION_DAYS = 30;

export type AppEnv = { Bindings: Env; Variables: { user: User } };

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return base64url(new Uint8Array(digest));
}

function emailAllowed(env: Env, email: string): boolean {
  const allowed = (env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

const cookieOptions = (url: string, maxAge: number) => ({
  path: '/',
  httpOnly: true,
  secure: new URL(url).protocol === 'https:',
  sameSite: 'Lax' as const,
  maxAge,
});

async function startSession(c: Context<AppEnv>, user: User) {
  const token = randomToken();
  await sessionsRepo(c.env.DB).create(await sha256(token), user.id, new Date(Date.now() + SESSION_DAYS * 86_400_000));
  setCookie(c, SESSION_COOKIE, token, cookieOptions(c.req.url, SESSION_DAYS * 86_400));
}

const redirectUri = (url: string) => `${new URL(url).origin}/auth/google/callback`;

export const authRoutes = new Hono<AppEnv>()
  .get('/google', (c) => {
    if (!c.env.GOOGLE_CLIENT_ID) return c.text('Google sign-in is not configured (GOOGLE_CLIENT_ID).', 500);
    // `state` ties the callback to this browser, so nobody can sign you in to their account.
    const state = randomToken();
    setCookie(c, STATE_COOKIE, state, cookieOptions(c.req.url, 600));
    const params = new URLSearchParams({
      client_id: c.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri(c.req.url),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  })
  .get('/google/callback', async (c) => {
    const { code, state, error } = c.req.query();
    const expected = getCookie(c, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: '/' });
    if (error) return c.redirect(`/?signin_error=${encodeURIComponent(error)}`);
    if (!code || !state || state !== expected) return c.redirect('/?signin_error=state');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: c.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: c.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: redirectUri(c.req.url),
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) return c.redirect('/?signin_error=token');
    const { access_token } = await tokenRes.json<{ access_token: string }>();

    // The userinfo endpoint is called over TLS with Google's own token, so no JWT verification is needed.
    const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${access_token}` } });
    if (!infoRes.ok) return c.redirect('/?signin_error=userinfo');
    const info = await infoRes.json<{ sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string }>();
    if (!info.email || !info.email_verified) return c.redirect('/?signin_error=email');
    if (!emailAllowed(c.env, info.email)) return c.redirect('/?signin_error=not_allowed');

    const user = await usersRepo(c.env.DB).upsertFromGoogle({ sub: info.sub, email: info.email, name: info.name ?? '', picture: info.picture ?? null });
    await startSession(c, user);
    return c.redirect('/');
  })
  // Local development only (DEV_LOGIN=true in .dev.vars): sign in as any email without Google.
  .get('/dev', async (c) => {
    if (c.env.DEV_LOGIN !== 'true') return c.notFound();
    const email = c.req.query('email')?.trim().toLowerCase();
    if (!email) return c.text('?email= required', 400);
    await startSession(c, await usersRepo(c.env.DB).upsertByEmail(email));
    return c.redirect('/');
  })
  .post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await sessionsRepo(c.env.DB).remove(await sha256(token));
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

/** Rejects API calls without a valid session; otherwise puts the user on the context. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await sessionsRepo(c.env.DB).userFor(await sha256(token)) : null;
  if (!user) return c.json({ error: 'Not signed in' }, 401);
  c.set('user', user);
  await next();
});
