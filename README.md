# Music Radar

Follow your favorite artists and see, in one place:

- **Latest and upcoming releases**: albums, EPs, singles, live records (MusicBrainz, Deezer, Apple Music)
- **Concerts** with ticket links (Ticketmaster, optionally Bandsintown)
- **News** about new albums, tours and announcements (Google News)
- **Links** to each artist's Instagram, X, TikTok, YouTube, Spotify, SoundCloud, Bandcamp and website

People sign in with Google; each person has their own list of artists. Runs on Cloudflare's free plan.

## Stack

| Part | Tech |
|---|---|
| Frontend | React 19 + TypeScript, Vite, TanStack Query |
| Backend | [Hono](https://hono.dev) on Cloudflare Workers |
| Storage | Cloudflare D1 (SQLite) — schema in `migrations/` |
| Sign-in | Google OAuth; sessions in D1, cookie holds a random token (only its hash is stored) |
| Refresh | Cron trigger every minute refreshes the artist with the oldest report |

## How data is shared

Artist details and reports are **shared**: when two people follow the same artist it's looked up once, and
↻ on an artist refreshes it for everyone. What each person follows is **theirs** (`user_artists`), and manual
artists belong to whoever added them. When nobody follows an artist any more, it's deleted.

Reports are kept 12 hours. The background refresh does one artist a minute (1,440 a day), which keeps up with
about 700 followed artists across all users, within the free plan's 10 ms CPU and 50 subrequests per run.
Newly added artists are fetched straight away.

## Deploying to Cloudflare

You need a free Cloudflare account and a Google Cloud project (for sign-in). One-time setup:

1. **Log in to Cloudflare** from this folder: `npx wrangler login`
2. **Create the database**: `npx wrangler d1 create music-radar`, then paste the printed `database_id` into
   `wrangler.jsonc`. Create the tables: `npm run db:migrate`
3. **Deploy once** to get your URL: `npm run deploy` → `https://music-radar.<your-subdomain>.workers.dev`
4. **Google sign-in** at https://console.cloud.google.com:
   - *APIs & Services → OAuth consent screen*: External, app name "Music Radar", your email. While the app is in
     *Testing*, only the Google accounts you list as test users can sign in (up to 100) — fine for friends.
   - *Credentials → Create credentials → OAuth client ID → Web application*. Authorized redirect URIs:
     `https://music-radar.<your-subdomain>.workers.dev/auth/google/callback` and, for local development,
     `http://localhost:5173/auth/google/callback`.
5. **Secrets** (never in git):
   ```sh
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put TICKETMASTER_API_KEY     # concerts; optional BANDSINTOWN_APP_ID
   ```
6. **Who may sign in**: `printf 'you@gmail.com,friend@gmail.com' | npx wrangler secret put ALLOWED_EMAILS`
   (comma-separated). Nobody can sign in while it's unset.

**Bring over a local list** (from the version that stored data in `data/music-radar.db`):
```sh
npm run import-local -- you@gmail.com
npx wrangler d1 execute music-radar --remote --file data/import.sql
```
Sign in with that Google account and the artists are there.

## Local development

```sh
cp .dev.vars.example .dev.vars    # fill in keys; DEV_LOGIN=true allows /auth/dev?email=you@example.com
npm run db:migrate:local
npm run dev                       # Worker on :8787, Vite on http://localhost:5173
curl "http://localhost:8787/cdn-cgi/local/scheduled"   # run the background refresh once
npm test                          # unit tests (scripts/)
```

**Browser tests** (Playwright, in `e2e/`) run the app in Chromium at desktop and phone size, against a
Vite server on :5174 that Playwright starts. The API is mocked with fixtures (`e2e/mock-api.ts`) and the
clock is fixed, so no worker, database or keys are needed.

```sh
npx playwright install chromium   # once
npm run test:e2e                  # add --ui to watch them run, --headed to see the browser
```

## Link reader (AI agent)

Many artists have nothing upcoming in Deezer, Apple Music or Ticketmaster, but their own pages do
(a tour page, a pre-order on Bandcamp). A command you run on your Mac when you want asks a Claude Code agent to read those pages
and saves what it finds to D1; the next report rebuild merges it in, marked **AI** with the page's words as a tooltip.
Design: [SPEC-link-reader.md](SPEC-link-reader.md).

- Runs `claude -p` (Sonnet) with only the WebFetch tool, so it uses your Claude subscription, not API credit.
- Checks up to 5 artists per run: followed, with readable links (not Instagram, Spotify…), nothing upcoming from
  the regular sources, and not checked in the last 7 days.
- Keeps a finding only if it cites a page the agent actually opened, quotes it, and has a valid future date
  (`scripts/link-reader/checks.ts`). Everything else is printed as "dropped".
- Writes to D1 through Cloudflare's HTTP API with `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` from `.env`.

```sh
npm run db:migrate                                   # once: creates link_findings and link_checks
npm run link-reader -- --dry-run                     # see what it would find, save nothing
npm run link-reader -- --artist "Daughter"           # one artist, even if checked recently
npm run link-reader                                  # check up to 5 and save
npm run link-reader -- --db-file data/test.db        # against a local SQLite copy instead of the live database
```

## Project layout

```
shared/types.ts         Types shared by server and web
migrations/             D1 schema
server/
  worker.ts             Worker entry: Hono routes (/api/*, /auth/*) + cron handler
  auth.ts               Google sign-in, sessions, requireUser middleware
  db.ts                 D1 queries (users, sessions, artists, follows, manual artists, reports)
  artists.ts            Resolve an artist across MusicBrainz / Deezer / Apple Music
  report.ts             Query every source, merge duplicates, store a compact report
  refresh.ts            Background refresh (one artist per cron run)
  sources/              One module per external API
scripts/
  export-local.ts       Copy the old local database into D1
  link-reader/          The AI link reader: index.ts (run), agent.ts (claude -p), checks.ts (verify), db.ts (D1)
web/src/                React app (sign-in screen, tabs, dialogs)
```

## API

All `/api` routes need a signed-in session.

| Method | Path | |
|---|---|---|
| GET | `/auth/google` → `/auth/google/callback` | Google sign-in |
| POST | `/auth/logout` | Sign out |
| GET | `/api/me` | Who's signed in |
| GET | `/api/search?q=` | Search MusicBrainz for artists |
| GET | `/api/artists` | Your artists with cached reports |
| POST | `/api/artists` `{ mbid }` | Follow an artist |
| POST | `/api/artists/bulk` `{ names }` | Follow up to 5 by name (confident matches only) |
| POST | `/api/manual-artists` `{ name, disambiguation?, links }` | Add an artist MusicBrainz doesn't list |
| PUT | `/api/manual-artists/:id` | Edit one of your manual artists |
| DELETE | `/api/artists/:id` | Unfollow |
| POST | `/api/artists/:id/refresh` | Re-check every source now |
| GET | `/api/config` | Whether concert sources are configured |

## Sources the app does not query
- **Spotify**: its API has no upcoming-release data and requires OAuth, so artists only get a link.
- **SoundCloud**: closed to new API apps; artists only get a link.
- **Instagram / X / TikTok**: their APIs are paid or closed; announcements reach the News tab via the press.
- **Last.fm**: has no release dates or concerts. It could later be used to import your top artists.
- **NPR**: no public search API; its stories appear through Google News.
