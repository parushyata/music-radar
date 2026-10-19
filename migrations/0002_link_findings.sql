-- The link reader (scripts/link-reader, SPEC-link-reader.md): upcoming releases and shows an AI agent found
-- on artists' own pages. Written by the script on a Mac, merged into reports by buildReport.

-- What was found. Each check replaces the artist's previous findings.
-- artist_id is an artists.id or a manual_artists.id (both UUIDs), so there is no foreign key;
-- unfollowing deletes these the same way it deletes the artist (server/db.ts).
CREATE TABLE link_findings (
  id          TEXT PRIMARY KEY,
  artist_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,         -- 'release' | 'show'
  data        TEXT NOT NULL,         -- the finding as JSON (ReleaseFinding / ShowFinding)
  source_url  TEXT NOT NULL,
  found_at    INTEGER NOT NULL
);
CREATE INDEX link_findings_artist ON link_findings (artist_id);

-- When each artist was last checked, so the daily run rotates through them.
CREATE TABLE link_checks (
  artist_id   TEXT PRIMARY KEY,
  checked_at  INTEGER NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',   -- the agent's one-line summary, or why the check failed
  unreadable  TEXT NOT NULL DEFAULT '[]'  -- JSON: pages it couldn't read, for debugging
);
