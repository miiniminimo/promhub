import "server-only";

import { getDb, sql } from "./db";

export type RateKind = "ai_chat" | "chat_upload";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Sliding windows per kind; AI limits can be tuned with PROMHUB_AI_PER_MINUTE / PROMHUB_AI_PER_DAY. */
const LIMITS: Record<RateKind, { ms: number; max: number }[]> = {
  ai_chat: [
    { ms: MINUTE, max: envInt("PROMHUB_AI_PER_MINUTE", 10) },
    { ms: DAY, max: envInt("PROMHUB_AI_PER_DAY", 100) },
  ],
  chat_upload: [
    { ms: MINUTE, max: 20 },
    { ms: DAY, max: 200 },
  ],
};

export type RateResult = { ok: true; remainingToday: number } | { ok: false; error: string };

function waitText(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.ceil(seconds / 60);
  return minutes < 60 ? `${minutes}분` : `${Math.ceil(minutes / 60)}시간`;
}

/** Records one `kind` request for the user, or refuses it when a window is already full. `label` names it in errors ("AI"). */
export function takeRateLimit(userId: number, kind: RateKind, label: string): RateResult {
  const now = Date.now();
  return getDb().transaction((): RateResult => {
    sql("DELETE FROM rate_events WHERE user_id = ? AND kind = ? AND at <= ?").run(userId, kind, now - DAY);
    let remainingToday = Infinity;
    for (const { ms, max } of LIMITS[kind]) {
      const { used, oldest } = sql(
        "SELECT COUNT(*) AS used, MIN(at) AS oldest FROM rate_events WHERE user_id = ? AND kind = ? AND at > ?",
      ).get(userId, kind, now - ms) as { used: number; oldest: number | null };
      if (used >= max) {
        const wait = waitText((oldest ?? now) + ms - now);
        return {
          ok: false,
          error:
            ms === DAY
              ? `오늘 ${label} 요청 한도(${max}회)를 모두 사용했어요. ${wait} 후에 다시 시도해주세요.`
              : `${label} 요청이 너무 잦아요. ${wait} 후에 다시 시도해주세요.`,
        };
      }
      if (ms === DAY) remainingToday = max - used - 1;
    }
    sql("INSERT INTO rate_events (user_id, kind, at) VALUES (?, ?, ?)").run(userId, kind, now);
    return { ok: true, remainingToday };
  })();
}
