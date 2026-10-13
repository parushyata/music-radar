/** Cloudflare bindings (wrangler.jsonc) and secrets (`wrangler secret put`, or .dev.vars locally). */
export interface Env {
  DB: D1Database;
  /** Comma-separated emails allowed to sign in; empty = anyone with a Google account. */
  ALLOWED_EMAILS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TICKETMASTER_API_KEY?: string;
  BANDSINTOWN_APP_ID?: string;
  /** Local development only: enables /auth/dev. Never set this in production. */
  DEV_LOGIN?: string;
}
