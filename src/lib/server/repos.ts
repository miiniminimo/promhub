import "server-only";

import { randomBytes } from "node:crypto";
import type { Post, PostImage, Style } from "../types";
import { db } from "./db";

export type Visibility = "public" | "private";

export type RepoSummary = {
  id: number;
  ownerId: number;
  owner: string;
  name: string;
  description: string;
  model: string;
  style: Style;
  cover: PostImage | null;
  visibility: Visibility;
  forkedPostId: string | null;
  forkedRepoId: number | null;
  forkedLabel: string | null;
  commitCount: number;
  headPrompt: string;
  createdAt: string;
  updatedAt: string;
};

export type Commit = {
  id: number;
  hash: string;
  message: string;
  prompt: string;
  negativePrompt: string | null;
  createdAt: string;
};

type RepoRow = {
  id: number;
  owner_id: number;
  owner: string;
  name: string;
  description: string;
  model: string;
  style: Style;
  cover_json: string | null;
  visibility: Visibility;
  forked_post_id: string | null;
  forked_repo_id: number | null;
  forked_label: string | null;
  commit_count: number;
  head_prompt: string;
  created_at: string;
  updated_at: string;
};

const SELECT_REPO = `
  SELECT r.*, u.username AS owner,
    (SELECT COUNT(*) FROM commits c WHERE c.repo_id = r.id) AS commit_count,
    (SELECT prompt FROM commits c WHERE c.repo_id = r.id ORDER BY c.id DESC LIMIT 1) AS head_prompt
  FROM repos r JOIN users u ON u.id = r.owner_id`;

function toSummary(row: RepoRow): RepoSummary {
  return {
    id: row.id,
    ownerId: row.owner_id,
    owner: row.owner,
    name: row.name,
    description: row.description,
    model: row.model,
    style: row.style,
    cover: row.cover_json ? (JSON.parse(row.cover_json) as PostImage) : null,
    visibility: row.visibility,
    forkedPostId: row.forked_post_id,
    forkedRepoId: row.forked_repo_id,
    forkedLabel: row.forked_label,
    commitCount: row.commit_count,
    headPrompt: row.head_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const shortHash = () => randomBytes(4).toString("hex").slice(0, 7);

export function slugify(text: string) {
  const slug = text
    .toLowerCase()
    .replace(/…/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "prompt";
}

/** Repo visible to `viewerId` (private repos only to their owner). */
export function getRepo(id: number, viewerId: number | null) {
  const row = db.prepare(`${SELECT_REPO} WHERE r.id = ?`).get(id) as RepoRow | undefined;
  if (!row) return null;
  if (row.visibility === "private" && row.owner_id !== viewerId) return null;
  return toSummary(row);
}

export function getCommits(repoId: number): Commit[] {
  return db
    .prepare(
      `SELECT id, hash, message, prompt, negative_prompt AS negativePrompt, created_at AS createdAt
       FROM commits WHERE repo_id = ? ORDER BY id`,
    )
    .all(repoId) as Commit[];
}

export function listUserRepos(ownerId: number) {
  return (
    db.prepare(`${SELECT_REPO} WHERE r.owner_id = ? ORDER BY r.updated_at DESC`).all(ownerId) as RepoRow[]
  ).map(toSummary);
}

/** Public original prompts (not forks) for the explore feed. */
export function listPublicOriginals() {
  return (
    db
      .prepare(
        `${SELECT_REPO} WHERE r.visibility = 'public' AND r.forked_post_id IS NULL AND r.forked_repo_id IS NULL
         ORDER BY r.created_at DESC`,
      )
      .all() as RepoRow[]
  ).map(toSummary);
}

type NewRepo = {
  ownerId: number;
  name: string;
  description: string;
  model: string;
  style: Style;
  cover: PostImage | null;
  visibility: Visibility;
  prompt: string;
  negativePrompt: string | null;
  message: string;
  forkedPostId?: string;
  forkedRepoId?: number;
  forkedLabel?: string;
};

export function createRepo(input: NewRepo): number {
  return db.transaction(() => {
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO repos (owner_id, name, description, model, style, cover_json, visibility,
           forked_post_id, forked_repo_id, forked_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.ownerId,
        input.name,
        input.description,
        input.model,
        input.style,
        input.cover ? JSON.stringify(input.cover) : null,
        input.visibility,
        input.forkedPostId ?? null,
        input.forkedRepoId ?? null,
        input.forkedLabel ?? null,
      );
    const repoId = Number(lastInsertRowid);
    db.prepare(
      "INSERT INTO commits (repo_id, hash, message, prompt, negative_prompt) VALUES (?, ?, ?, ?, ?)",
    ).run(repoId, shortHash(), input.message, input.prompt, input.negativePrompt);
    return repoId;
  })();
}

export function forkPost(ownerId: number, post: Post) {
  return createRepo({
    ownerId,
    name: slugify(post.title),
    description: post.title,
    model: post.model,
    style: post.style,
    cover: post.images[0],
    visibility: "private",
    prompt: post.prompt,
    negativePrompt: post.negativePrompt,
    message: `Fork from @${post.author}`,
    forkedPostId: post.id,
    forkedLabel: `@${post.author} / ${post.title}`,
  });
}

export function forkRepo(ownerId: number, source: RepoSummary) {
  const head = getCommits(source.id).at(-1)!;
  return createRepo({
    ownerId,
    name: source.name,
    description: source.description,
    model: source.model,
    style: source.style,
    cover: source.cover,
    visibility: "private",
    prompt: head.prompt,
    negativePrompt: head.negativePrompt,
    message: `Fork from ${source.owner}/${source.name}@${head.hash}`,
    forkedRepoId: source.id,
    forkedLabel: `${source.owner} / ${source.name}`,
  });
}

export function addCommit(
  repoId: number,
  change: { message: string; prompt: string; negativePrompt: string | null },
) {
  db.transaction(() => {
    db.prepare(
      "INSERT INTO commits (repo_id, hash, message, prompt, negative_prompt) VALUES (?, ?, ?, ?, ?)",
    ).run(repoId, shortHash(), change.message, change.prompt, change.negativePrompt);
    db.prepare("UPDATE repos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(repoId);
  })();
}

export function setVisibility(repoId: number, visibility: Visibility) {
  db.prepare("UPDATE repos SET visibility = ? WHERE id = ?").run(visibility, repoId);
}

export function saveImage(ownerId: number, mime: string, data: Buffer) {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO images (owner_id, mime, data) VALUES (?, ?, ?)")
    .run(ownerId, mime, data);
  return Number(lastInsertRowid);
}

export function getImage(id: number) {
  return db.prepare("SELECT mime, data FROM images WHERE id = ?").get(id) as
    | { mime: string; data: Buffer }
    | undefined;
}
