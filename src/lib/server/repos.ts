import "server-only";

import { randomBytes } from "node:crypto";
import { joinNegative } from "../prompt-format";
import type { Post, PostImage, Style } from "../types";
import { getDb, sql } from "./db";

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

/** A source image: `src` is what we render, `link` the original page/URL it came from (if any). */
export type RepoSource = { src: string; link: string | null };

export type Commit = { id: number; hash: string; message: string; prompt: string; createdAt: string };

// Columns are aliased to RepoSummary's field names, so rows only need the cover parsed.
const SELECT_REPO = `
  SELECT r.id, r.owner_id AS ownerId, u.username AS owner, r.name, r.description, r.model, r.style,
    r.cover_json AS coverJson, r.visibility, r.forked_post_id AS forkedPostId,
    r.forked_repo_id AS forkedRepoId, r.forked_label AS forkedLabel,
    r.created_at AS createdAt, r.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM commits c WHERE c.repo_id = r.id) AS commitCount,
    (SELECT prompt FROM commits c WHERE c.repo_id = r.id ORDER BY c.id DESC LIMIT 1) AS headPrompt
  FROM repos r JOIN users u ON u.id = r.owner_id`;

type RepoRow = Omit<RepoSummary, "cover"> & { coverJson: string | null };

const toSummary = ({ coverJson, ...row }: RepoRow): RepoSummary => ({
  ...row,
  cover: coverJson ? (JSON.parse(coverJson) as PostImage) : null,
});

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
  const row = sql(`${SELECT_REPO} WHERE r.id = ?`).get(id) as RepoRow | undefined;
  if (!row || (row.visibility === "private" && row.ownerId !== viewerId)) return null;
  return toSummary(row);
}

export function getCommits(repoId: number) {
  return sql("SELECT id, hash, message, prompt, created_at AS createdAt FROM commits WHERE repo_id = ? ORDER BY id").all(
    repoId,
  ) as Commit[];
}

export function getSources(repoId: number) {
  return sql("SELECT src, link FROM repo_sources WHERE repo_id = ? ORDER BY sort_order").all(repoId) as RepoSource[];
}

export function listUserRepos(ownerId: number) {
  return (sql(`${SELECT_REPO} WHERE r.owner_id = ? ORDER BY r.updated_at DESC`).all(ownerId) as RepoRow[]).map(
    toSummary,
  );
}

/** A user's public repos (originals and forks) for their profile page. */
export function listPublicRepos(ownerId: number) {
  return (
    sql(`${SELECT_REPO} WHERE r.owner_id = ? AND r.visibility = 'public' ORDER BY r.updated_at DESC`).all(
      ownerId,
    ) as RepoRow[]
  ).map(toSummary);
}

/** Public original prompts (not forks) for the explore feed. */
export function listPublicOriginals() {
  return (
    sql(
      `${SELECT_REPO} WHERE r.visibility = 'public' AND r.forked_post_id IS NULL AND r.forked_repo_id IS NULL
       ORDER BY r.created_at DESC`,
    ).all() as RepoRow[]
  ).map(toSummary);
}

type NewRepo = Pick<RepoSummary, "ownerId" | "name" | "description" | "model" | "style" | "cover" | "visibility"> & {
  prompt: string;
  message: string;
  sources?: RepoSource[];
  forkedPostId?: string;
  forkedRepoId?: number;
  forkedLabel?: string;
};

const insertCommit = (repoId: number, message: string, prompt: string) =>
  sql("INSERT INTO commits (repo_id, hash, message, prompt) VALUES (?, ?, ?, ?)").run(
    repoId,
    shortHash(),
    message,
    prompt,
  );

export function createRepo(input: NewRepo): number {
  return getDb().transaction(() => {
    const { lastInsertRowid } = sql(
      `INSERT INTO repos (owner_id, name, description, model, style, cover_json, visibility,
         forked_post_id, forked_repo_id, forked_label)
       VALUES (@ownerId, @name, @description, @model, @style, @coverJson, @visibility,
         @forkedPostId, @forkedRepoId, @forkedLabel)`,
    ).run({
      ownerId: input.ownerId,
      name: input.name,
      description: input.description,
      model: input.model,
      style: input.style,
      visibility: input.visibility,
      coverJson: input.cover ? JSON.stringify(input.cover) : null,
      forkedPostId: input.forkedPostId ?? null,
      forkedRepoId: input.forkedRepoId ?? null,
      forkedLabel: input.forkedLabel ?? null,
    });
    const repoId = Number(lastInsertRowid);
    insertCommit(repoId, input.message, input.prompt);
    const insertSource = sql("INSERT INTO repo_sources (repo_id, src, link, sort_order) VALUES (?, ?, ?, ?)");
    input.sources?.forEach((s, i) => insertSource.run(repoId, s.src, s.link, i));
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
    prompt: joinNegative(post.prompt, post.negativePrompt),
    message: `Fork from @${post.author}`,
    forkedPostId: post.id,
    forkedLabel: `@${post.author} / ${post.title}`,
  });
}

export function forkRepo(ownerId: number, source: RepoSummary) {
  const head = getCommits(source.id).at(-1)!;
  return createRepo({
    ...source,
    ownerId,
    visibility: "private",
    prompt: head.prompt,
    message: `Fork from ${source.owner}/${source.name}@${head.hash}`,
    sources: getSources(source.id),
    forkedPostId: undefined,
    forkedRepoId: source.id,
    forkedLabel: `${source.owner} / ${source.name}`,
  });
}

export function addCommit(repoId: number, change: { message: string; prompt: string }) {
  getDb().transaction(() => {
    insertCommit(repoId, change.message, change.prompt);
    sql("UPDATE repos SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(repoId);
  })();
}

export function setVisibility(repoId: number, visibility: Visibility) {
  sql("UPDATE repos SET visibility = ? WHERE id = ?").run(visibility, repoId);
}

export function saveImage(ownerId: number, mime: string, data: Buffer) {
  return Number(sql("INSERT INTO images (owner_id, mime, data) VALUES (?, ?, ?)").run(ownerId, mime, data).lastInsertRowid);
}

export function getImage(id: number) {
  return sql("SELECT mime, data FROM images WHERE id = ?").get(id) as { mime: string; data: Buffer } | undefined;
}

export function imageOwner(id: number) {
  const row = sql("SELECT owner_id AS ownerId FROM images WHERE id = ?").get(id) as { ownerId: number } | undefined;
  return row?.ownerId ?? null;
}

// ---------- Chat attachments ----------

export type ChatFile = { id: number; name: string; mime: string; data: Buffer };

export function saveChatFile(ownerId: number, name: string, mime: string, data: Buffer) {
  return Number(
    sql("INSERT INTO chat_files (owner_id, name, mime, data) VALUES (?, ?, ?, ?)").run(ownerId, name, mime, data)
      .lastInsertRowid,
  );
}

/** The requested chat files that belong to `ownerId`, in the requested order. */
export function getChatFiles(ownerId: number, ids: number[]): ChatFile[] {
  if (ids.length === 0) return [];
  const rows = sql(
    `SELECT id, name, mime, data FROM chat_files WHERE owner_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
  ).all(ownerId, ...ids) as ChatFile[];
  return ids.flatMap((id) => rows.filter((r) => r.id === id));
}
