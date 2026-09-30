CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL
);

-- A prompt repository. Either an original ("opened" by the owner) or a fork of a
-- Civitai post / another repo.
CREATE TABLE IF NOT EXISTS repos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  model          TEXT NOT NULL,
  style          TEXT NOT NULL CHECK (style IN ('anime', 'photo', 'illustration')),
  cover_json     TEXT,
  visibility     TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  forked_post_id TEXT,
  forked_repo_id INTEGER REFERENCES repos(id) ON DELETE SET NULL,
  forked_label   TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS repos_owner ON repos(owner_id);

CREATE TABLE IF NOT EXISTS commits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id         INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  hash            TEXT NOT NULL,
  message         TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  negative_prompt TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS commits_repo ON commits(repo_id, id);
