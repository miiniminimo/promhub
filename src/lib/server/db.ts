import "server-only";

import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CHALLENGES } from "../challenges";

const DB_PATH = process.env.PROMHUB_DB ?? path.join(process.cwd(), "data", "promhub.db");

function open() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(path.join(process.cwd(), "src/lib/server/schema.sql"), "utf8"));
  migrate(db);

  // Challenges are defined in code; keep the table in sync on every boot.
  const upsert = db.prepare(`
    INSERT INTO challenges (slug, level, title, category, description, tests_json, sort_order)
    VALUES (@slug, @level, @title, @category, @description, @tests_json, @sort_order)
    ON CONFLICT(slug) DO UPDATE SET level = excluded.level, title = excluded.title,
      category = excluded.category, description = excluded.description,
      tests_json = excluded.tests_json, sort_order = excluded.sort_order`);
  db.transaction(() => {
    CHALLENGES.forEach((c, i) =>
      upsert.run({ ...c, tests_json: JSON.stringify(c.tests), sort_order: i }),
    );
  })();
  return db;
}

/** One-off schema changes for databases created by earlier versions. */
function migrate(db: Database.Database) {
  const commitColumns = db.prepare("PRAGMA table_info(commits)").all() as { name: string }[];
  if (commitColumns.some((c) => c.name === "negative_prompt")) {
    // The negative prompt now lives in the prompt text as a trailing "Negative prompt:" line.
    db.transaction(() => {
      db.exec(`UPDATE commits SET prompt = prompt || char(10) || 'Negative prompt: ' || negative_prompt
               WHERE negative_prompt IS NOT NULL AND trim(negative_prompt) <> ''`);
      db.exec("ALTER TABLE commits DROP COLUMN negative_prompt");
    })();
  }
}

// Opened lazily on first use (not at import time) so `next build` workers that only
// analyse routes never touch the file concurrently. Reused across dev hot reloads.
const globalForDb = globalThis as unknown as { promhubDb?: Database.Database };

export function getDb() {
  globalForDb.promhubDb ??= open();
  return globalForDb.promhubDb;
}

const statements = new Map<string, Database.Statement>();

/**
 * A prepared statement for `text`, compiled once and reused. Re-preparing on every call
 * costs ~10x the query itself (measured ~49µs vs ~4.5µs for the repo lookup).
 */
export function sql(text: string) {
  let statement = statements.get(text);
  if (!statement) {
    statement = getDb().prepare(text);
    statements.set(text, statement);
  }
  return statement;
}
