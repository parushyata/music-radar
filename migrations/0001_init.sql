-- Music Radar on Cloudflare D1.
-- Artist data and reports are shared: if two people follow the same artist it is looked up once.
-- What each person follows lives in user_artists (MusicBrainz artists) and manual_artists (their own).

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  google_sub  TEXT UNIQUE,            -- NULL until the first Google sign-in (rows created by the local import)
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL DEFAULT '',
  picture     TEXT,
  created_at  TEXT NOT NULL
);

-- Only a SHA-256 hash of the session token is stored; the token itself lives in the browser cookie.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE artists (
  id                   TEXT PRIMARY KEY,
  mbid                 TEXT NOT NULL UNIQUE,
  name                 TEXT NOT NULL,
  disambiguation       TEXT NOT NULL DEFAULT '',
  country              TEXT NOT NULL DEFAULT '',
  type                 TEXT NOT NULL DEFAULT '',
  deezer_id            INTEGER,
  itunes_id            INTEGER,
  image                TEXT,
  links                TEXT NOT NULL DEFAULT '[]',
  added_at             TEXT NOT NULL,
  -- When the background refresh last tried this artist, so one that keeps failing doesn't block the rest.
  refresh_attempted_at INTEGER
);

CREATE TABLE user_artists (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_id  TEXT NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  added_at   TEXT NOT NULL,
  PRIMARY KEY (user_id, artist_id)
);
CREATE INDEX user_artists_artist ON user_artists (artist_id);

CREATE TABLE reports (
  artist_id  TEXT PRIMARY KEY REFERENCES artists(id) ON DELETE CASCADE,
  fetched_at INTEGER NOT NULL,
  data       TEXT NOT NULL
);

-- Artists MusicBrainz doesn't list, added by hand. Each belongs to the person who added it.
CREATE TABLE manual_artists (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL COLLATE NOCASE,
  disambiguation       TEXT NOT NULL DEFAULT '',
  deezer_id            INTEGER,
  itunes_id            INTEGER,
  image                TEXT,
  links                TEXT NOT NULL DEFAULT '[]',
  added_at             TEXT NOT NULL,
  refresh_attempted_at INTEGER,
  UNIQUE (user_id, name)
);

CREATE TABLE manual_reports (
  artist_id  TEXT PRIMARY KEY REFERENCES manual_artists(id) ON DELETE CASCADE,
  fetched_at INTEGER NOT NULL,
  data       TEXT NOT NULL
);
