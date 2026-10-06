Good to hear it's working. A few notes for day-to-day use:

- Starting it: the app runs until you restart your Mac. Afterwards, start it again with cd ~/music-radar && npm start.
- Adding more artists: paste a whole list into Add many. Lookups take about 2 seconds per artist. If a name matches several artists, the app skips it so you can add it with search instead.
- Freshness: results are rechecked every 6 hours when you open the page, or right away with ↻.

Possible next steps:
1. Start it automatically when you log in, so you don't need the terminal.
2. Send a Mac notification when a followed artist announces a new album or a show near you.
3. Import your artists from Last.fm, if you use it.



Do you need a database? Not a database server. The app only stores your artist list, your API keys, and saved results (kept 6 hours so it doesn't query every source each time). For that I used SQLite, which is built into Node: all of it lives in one file, data/music-radar.db. Unlike the Postgres setup in your iluvcoffee project, there's no Docker and nothing to install.

What I used:
- Frontend: React 19 + TypeScript, built with Vite. TanStack Query handles loading and caching.
- Backend: TypeScript with Hono, a small web framework. Node 26 runs .ts files directly, so the server has no compile step.
- Shared types: shared/types.ts is used by both sides, so the API and the UI can't drift out of sync.
- Data sources: each one has its own file in server/sources/, so adding Last.fm later is one new file.

How to run it:
- npm run dev for development with hot reload, at http://localhost:5173.
- npm run build, then npm start, for normal use at http://localhost:4321. The build also typechecks everything.



- Ticketmaster key: it's in the app's database, in the settings table of data/music-radar.db. I saved it there for you, which works the same as pasting it into ⚙ Settings.
- Bandsintown app ID: you don't have one. It's optional, so the app just skips Bandsintown, and the Settings dialog shows it as "not set".

To see the stored keys yourself:
sqlite3 ~/my-project/music-radar/data/music-radar.db "SELECT * FROM settings;"

Settings shows only "connected" or "not set", never the key itself. If you lose the Ticketmaster key, it's also on the Ticketmaster developer site, under My Apps or in the example links on the docs page.

If you'd rather keep keys in the environment, like the .env in your iluvcoffee project:
1. Create ~/my-project/music-radar/.env with this line:
TICKETMASTER_API_KEY=your-key-here
2. Start the app with node --env-file=.env server/index.ts, or add --env-file-if-exists=.env to the start and dev:api scripts in package.json.

.env is already in .gitignore, so it won't get committed. An environment variable takes priority over the database value. If you'd like, I can add .env support to the scripts.