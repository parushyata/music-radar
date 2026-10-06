# Music Radar

Follow your favorite artists and see, in one place:

- **Latest and upcoming releases**: albums, EPs, singles, live records (MusicBrainz, Deezer, Apple Music)
- **Concerts** with ticket links (Ticketmaster, optionally Bandsintown)
- **News** about new albums, tours and announcements (Google News)
- **Links** to each artist's Instagram, X, TikTok, YouTube, Spotify, SoundCloud, Bandcamp and website

## Stack

| Part | Tech |
|---|---|
| Frontend | React 19 + TypeScript, Vite, TanStack Query |
| Backend | TypeScript on Node ≥ 24 (run directly, no compile step), [Hono](https://hono.dev) |
| Storage | SQLite via Node's built-in `node:sqlite`, stored in `data/music-radar.db` (no DB server) |

## Scripts

```sh
npm install
npm run dev        # API on :4321 + Vite on http://localhost:5173 (hot reload)
npm run build      # typecheck everything, build the React app into dist/
npm start          # production: one server on http://localhost:4321 serving API + app
npm run typecheck  # tsc for server and web
```

## Concert dates

Ticketmaster needs a free API key. Register at https://developer-acct.ticketmaster.com/user/register.
Your key appears in the example URLs on the docs page (`apikey=...`) and under **My Apps**.
Paste it in **⚙ Settings**, or set `TICKETMASTER_API_KEY` in the environment, which takes precedence.
`BANDSINTOWN_APP_ID` is optional.

## Project layout

```
shared/types.ts          Types shared by server and web
server/
  index.ts               Hono routes (/api/*) + static hosting in production
  db.ts                  SQLite schema and repositories (artists, settings, reports)
  artists.ts             Resolve an artist across MusicBrainz / Deezer / Apple Music
  report.ts              Query every source, merge duplicates, cache for 6 hours
  config.ts              API keys (env vars or settings table)
  sources/               One module per external API
web/
  index.html
  src/
    App.tsx              Layout, tabs, dialogs
    api.ts               Typed fetch client
    hooks.ts             TanStack Query hooks
    views/               Overview, Releases, Concerts, News tabs
    components/          Cards, lists, dialogs, search
    lib/                 Date formatting, report summaries
```

## API

| Method | Path | |
|---|---|---|
| GET | `/api/search?q=` | Search MusicBrainz for artists |
| GET | `/api/artists` | Followed artists with cached reports |
| POST | `/api/artists` `{ mbid }` | Follow an artist |
| POST | `/api/artists/bulk` `{ names }` | Follow many by name (confident matches only) |
| DELETE | `/api/artists/:id` | Unfollow |
| GET | `/api/artists/:id/report[?refresh=1]` | Releases, events, news (cached 6 h) |
| GET/POST | `/api/config` | Which API keys are set / save keys |

## Sources the app does not query
- **Spotify**: its API has no upcoming-release data and requires OAuth, so artists only get a link.
- **SoundCloud**: closed to new API apps; artists only get a link.
- **Instagram / X / TikTok**: their APIs are paid or closed; announcements reach the News tab via the press.
- **Last.fm**: has no release dates or concerts. It could later be used to import your top artists.
- **NPR**: no public search API; its stories appear through Google News.
