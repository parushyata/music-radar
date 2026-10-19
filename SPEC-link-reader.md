# Spec: link reader agent

Status: **built** on the `link-reader` branch (see "Built" at the end). Not yet live: needs the migration and a deploy.
It runs only when started by hand (`npm run link-reader`); there's no schedule.

## Problem

Many followed artists have thin reports. Deezer and Apple Music only list what's released, and Ticketmaster
misses small venues. In the 13 Oct snapshot, 20+ artists (Daughter, London Grammar, CLOVES, Vikki Gilmore…)
show **no upcoming releases and no shows**. Their own pages often do: a "new single out 7 Nov" on the website,
a tour page, a Bandcamp pre-order. Every artist already has these links saved (`artists.links`, from MusicBrainz,
or typed in for manual artists). Reading them by hand is what this replaces.

## Goal

A command you run by hand that, for a few artists at a time, reads their pages like a person would and adds what it finds
to their report: **upcoming releases and upcoming shows**, each with the page it came from, marked as found by AI.

Not in scope (v1): news, past releases, artists with no links, Instagram/Facebook/X (they need a login).

## Why it's an agent (and not a scraper)

The steps differ per artist: a Linktree leads to a tour page; a website has dates in a news post; a Bandcamp
page has a pre-order. Which links to open, which to follow from there and when to stop are decisions made
while reading. That's the model's job; everything around it (choosing artists, checking output, saving) is ordinary code.

## Flow

```
your Mac, when you run it                          Cloudflare
scripts/link-reader.ts
  1. pick artists ──────────── D1 HTTP API ──────▶ D1: artists, reports, link_checks
  2. for each artist:
       claude -p  (Sonnet, your Pro plan)
         tools: WebFetch only
         input: name + saved links + today's date
         output: JSON (schema below)
  3. check the output in code
  4. save ─────────────────── D1 HTTP API ──────▶ D1: link_findings, link_checks
                                                   (+ mark the report stale)
                                                      │
                                       cron (every minute) rebuilds the report:
                                       buildReport merges link_findings into
                                       releases / events, source "AI · <site>"
```

Why on the Mac: `claude -p` uses your Pro plan (free); a Worker would need a paid API key.
Why the D1 HTTP API (with `CLOUDFLARE_API_TOKEN` from `.env`) instead of a new `/api` route: no new public
endpoint or second kind of login to secure. It supports `?` parameters like the Worker does.

## Choosing artists (step 1)

Per run, at most **`LINK_READER_BATCH` = 5** artists that:
- are followed by someone,
- have at least one readable link (not only Instagram/Facebook/X/Spotify/Apple/Deezer/Discogs/Wikidata),
- have no upcoming release **and** no upcoming show in their current report,
- weren't checked in the last **7 days** (`link_checks.checked_at`).

Oldest check first; never-checked first of all. 5 a day covers the ~25 thin artists about once a week.

## The agent (step 2)

`claude -p --model sonnet --effort low --tools WebFetch --allowedTools WebFetch --output-format stream-json --verbose --json-schema …`

Prompt (draft):
> You're checking whether the artist **{name}** has upcoming releases or shows. Today is {date}.
> Start from these pages: {links}. Open the ones likely to have news, tour dates or releases (official website,
> Linktree, Bandcamp, tour/news pages they link to). Follow links on those pages if they look relevant.
> Open at most 8 pages. Only report something if the page states it; never infer dates. Only report things
> dated after today. If a page can't be read, list it under `unreadable`. It's fine to find nothing.

Output schema:
```ts
{
  releases: { title: string; date: string /* YYYY, YYYY-MM or YYYY-MM-DD */; type: 'album' | 'ep' | 'single' | 'other';
              source_url: string; quote: string /* the words on the page */ }[];
  shows:    { date: string /* YYYY-MM-DD */; city: string; country: string; venue: string;
              source_url: string; quote: string }[];
  unreadable: { url: string; reason: string }[];
  notes: string; // one line: what it looked at
}
```

## Checks in code (step 3): don't trust, verify

A finding is dropped (and logged) if:
- `source_url` is not a page the agent actually fetched (read from the WebFetch calls in the stream-json log),
- the date isn't valid or isn't after today,
- `quote` is empty.

This is the main defence against invented releases. It's not proof: WebFetch has a small model summarise each page
for the agent, so the agent never sees the raw HTML, and the quote comes from that summary.
URLs are compared loosely (http/https, `www.`, trailing slash), because WebFetch follows redirects.

## Storage (step 4)

New migration `0002_link_findings.sql`:
```sql
CREATE TABLE link_findings (
  id          TEXT PRIMARY KEY,
  artist_id   TEXT NOT NULL,        -- artists.id or manual_artists.id (both UUIDs)
  kind        TEXT NOT NULL,        -- 'release' | 'show'
  data        TEXT NOT NULL,        -- the finding as JSON
  source_url  TEXT NOT NULL,
  found_at    INTEGER NOT NULL
);
CREATE INDEX link_findings_artist ON link_findings (artist_id);

CREATE TABLE link_checks (
  artist_id   TEXT PRIMARY KEY,
  checked_at  INTEGER NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',
  unreadable  TEXT NOT NULL DEFAULT '[]'  -- JSON, for debugging
);
```
Each run **replaces** that artist's findings (delete + insert in one batch), so dates that have passed or were
removed from the site disappear. Then it sets that artist's `reports.fetched_at = 0` so the cron rebuilds it within minutes.
Unfollowing until nobody follows an artist deletes its findings too (same as reports).

## Showing it (Worker + web)

- `server/report.ts` → `buildReport` reads the artist's `link_findings` and merges them in with the existing
  `mergeReleases` / `mergeEvents`, so a release found both on Deezer and on the website appears once.
  Source name: `AI · vikkigilmore.com`, linking to `source_url`.
- Web: sources starting `AI ·` get a small "AI" badge, with the quote as a tooltip.
- No change to `followedListJson`, so no extra CPU on page load.

## Limits and cost

- Pro plan usage: ~5 artists × up to 8 pages a day. If usage runs out, the run stops and tries again tomorrow
  (same handling as Job Radar's `ScoringStopError`).
- Sites that block bots or need JavaScript come back as `unreadable`; that's expected.
- Shared artists mean shared findings: what the agent finds for Daughter shows for everyone who follows Daughter.

## Testing

- Unit tests for step 1 (selection SQL), step 3 (checks) and the merge in `buildReport`.
- A small **eval**: save the HTML of ~5 artist pages with known answers (one with a tour, one with a pre-order,
  one with nothing, one unreadable) and check the agent's output against them. Re-run it when the prompt changes.

## Milestones

1. **Prototype**: `npm run link-reader -- "Daughter"` runs the agent for one artist and prints the checked
   findings. No database. Try Daughter, Vikki Gilmore, Murdo Mitchell (Instagram only → expect nothing + unreadable).
2. **Storage**: migration, D1 HTTP client, selection, save. Run against the live DB by hand.
3. **Display**: merge in `buildReport`, AI badge. Deploy.
4. **Schedule**: launchd job (copy Job Radar's `scripts/schedule.sh`).
5. **Eval set** and tests.

## Open questions

1. A way to hide a wrong finding from the page (a ✕ on AI items)? Simple to add after milestone 3.
2. Should manual artists be checked more often (they have no other source)?
3. Later, for learning: replace `claude -p` with your own agent loop (learn-agents step 3) using a fetch tool you
   write, and compare results on the eval set.

## Built

- `scripts/link-reader/` — `index.ts` (selection, saving, CLI), `agent.ts` (prompt, schema, `claude -p`),
  `checks.ts` (readable links, verification), `db.ts` (D1 HTTP API or a local SQLite file), `checks.test.ts`.
- `migrations/0002_link_findings.sql`.
- `server/report.ts` — `fromLinkFindings` turns findings into one more source (`AI · <site>`) for `mergeReleases` /
  `mergeEvents`; the report's source list gets "Link reader (AI)" with the count.
- `server/db.ts` — unfollowing (or deleting a manual artist) deletes its findings and check record once the artist row is gone.
- Web — `SourceName` in `ui.tsx`: an AI badge, and the quote as a tooltip, on releases and shows.

Changes from the draft: run by hand instead of daily (milestone 4 dropped); the stop rule for a failing artist (it's recorded as checked with a "failed" note, so it
doesn't take a slot every day); Songkick added to the prompt; the prompt now also asks for the website's tour/news/releases pages
(the first runs stopped at the home page) and says nobody can answer questions.

Still open: milestone 5's eval set. WebFetch reads live pages, so saved HTML can't be fed to it as is;
options are an eval of `checks.ts` + recorded agent runs, or the learn-agents loop with a fetch tool that serves saved pages.
