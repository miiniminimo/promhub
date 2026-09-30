import "server-only";

import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DB_PATH = process.env.PROMHUB_DB ?? path.join(process.cwd(), "data", "promhub.db");

function open() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(path.join(process.cwd(), "src/lib/server/schema.sql"), "utf8"));
  return db;
}

// Reuse one connection across dev hot reloads.
const globalForDb = globalThis as unknown as { promhubDb?: Database.Database };
export const db = globalForDb.promhubDb ?? open();
globalForDb.promhubDb = db;
