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

// Reuse one connection across dev hot reloads.
const globalForDb = globalThis as unknown as { promhubDb?: Database.Database };
export const db = globalForDb.promhubDb ?? open();
globalForDb.promhubDb = db;
