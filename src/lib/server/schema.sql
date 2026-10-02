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
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS commits_repo ON commits(repo_id, id);

-- Source images (inputs / references) attached to a repo: an uploaded image or an external link.
CREATE TABLE IF NOT EXISTS repo_sources (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  repo_id    INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  src        TEXT NOT NULL,
  link       TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS repo_sources_repo ON repo_sources(repo_id, sort_order);

-- Files attached in the AI prompt-builder chat (images, text, PDFs).
CREATE TABLE IF NOT EXISTS chat_files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Prompt test ("coding test" style) problems and graded submissions.
CREATE TABLE IF NOT EXISTS challenges (
  slug        TEXT PRIMARY KEY,
  level       INTEGER NOT NULL,
  title       TEXT NOT NULL,
  category    TEXT NOT NULL,
  description TEXT NOT NULL,
  tests_json  TEXT NOT NULL,
  sort_order  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS submissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_slug TEXT NOT NULL REFERENCES challenges(slug) ON DELETE CASCADE,
  prompt         TEXT NOT NULL,
  score          INTEGER NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS submissions_user ON submissions(user_id, challenge_slug);
