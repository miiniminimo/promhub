import "server-only";

import { CHALLENGES } from "../challenges";
import { getDb } from "./db";

export type ChallengeStatus = { slug: string; bestScore: number | null; attempts: number };

export function saveSubmission(userId: number, slug: string, prompt: string, score: number) {
  getDb().prepare("INSERT INTO submissions (user_id, challenge_slug, prompt, score) VALUES (?, ?, ?, ?)").run(
    userId,
    slug,
    prompt,
    score,
  );
}

export function challengeStatuses(userId: number | null): Map<string, ChallengeStatus> {
  const rows = userId
    ? (getDb()
        .prepare(
          `SELECT challenge_slug AS slug, MAX(score) AS bestScore, COUNT(*) AS attempts
           FROM submissions WHERE user_id = ? GROUP BY challenge_slug`,
        )
        .all(userId) as ChallengeStatus[])
    : [];
  return new Map(rows.map((r) => [r.slug, r]));
}

export function lastSubmission(userId: number, slug: string) {
  return getDb()
    .prepare(
      "SELECT prompt, score FROM submissions WHERE user_id = ? AND challenge_slug = ? ORDER BY id DESC LIMIT 1",
    )
    .get(userId, slug) as { prompt: string; score: number } | undefined;
}

export function testSummary(userId: number) {
  const statuses = challengeStatuses(userId);
  const solved = CHALLENGES.filter((c) => statuses.get(c.slug)?.bestScore === 100);
  const next = CHALLENGES.find((c) => statuses.get(c.slug)?.bestScore !== 100) ?? null;
  return { total: CHALLENGES.length, solved: solved.length, next };
}
