import "server-only";

import { sql } from "./db";

export type UserRef = { id: number; username: string };
export type LikeKind = "post" | "repo";

export function getUserByUsername(username: string) {
  return sql("SELECT id, username FROM users WHERE username = ?").get(username) as UserRef | undefined;
}

// ---------- Follows ----------

export function isFollowing(followerId: number, followeeId: number) {
  return !!sql("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?").get(followerId, followeeId);
}

export function setFollow(followerId: number, followeeId: number, on: boolean) {
  if (on) sql("INSERT OR IGNORE INTO follows (follower_id, followee_id) VALUES (?, ?)").run(followerId, followeeId);
  else sql("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?").run(followerId, followeeId);
}

export function followCounts(userId: number) {
  return sql(
    `SELECT (SELECT COUNT(*) FROM follows WHERE followee_id = ?) AS followers,
            (SELECT COUNT(*) FROM follows WHERE follower_id = ?) AS following`,
  ).get(userId, userId) as { followers: number; following: number };
}

/** People who follow `userId` ("followers") or whom `userId` follows ("following"), newest first. */
export function listFollows(userId: number, direction: "followers" | "following") {
  const [me, them] = direction === "followers" ? ["followee_id", "follower_id"] : ["follower_id", "followee_id"];
  return sql(
    `SELECT u.id, u.username, f.created_at AS since FROM follows f JOIN users u ON u.id = f.${them}
     WHERE f.${me} = ? ORDER BY f.created_at DESC`,
  ).all(userId) as (UserRef & { since: string })[];
}

// ---------- Likes ----------

export function likeInfo(kind: LikeKind, targetId: string, userId: number | null) {
  return sql(
    `SELECT COUNT(*) AS count, COALESCE(MAX(user_id = ?), 0) AS liked FROM likes WHERE kind = ? AND target_id = ?`,
  ).get(userId ?? -1, kind, targetId) as { count: number; liked: 0 | 1 };
}

export function setLike(userId: number, kind: LikeKind, targetId: string, on: boolean) {
  if (on) sql("INSERT OR IGNORE INTO likes (user_id, kind, target_id) VALUES (?, ?, ?)").run(userId, kind, targetId);
  else sql("DELETE FROM likes WHERE user_id = ? AND kind = ? AND target_id = ?").run(userId, kind, targetId);
}

export function listLikes(userId: number) {
  return sql("SELECT kind, target_id AS targetId FROM likes WHERE user_id = ? ORDER BY created_at DESC").all(userId) as {
    kind: LikeKind;
    targetId: string;
  }[];
}
