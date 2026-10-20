import "server-only";

import { randomBytes } from "node:crypto";
import { CHALLENGES, grade, scoreOf } from "../challenges";
import { POSTS } from "../posts";
import type { PostImage, Style } from "../types";
import { hashPassword } from "./auth";
import { getDb, sql } from "./db";
import { slugify } from "./repos";

/** Local demo accounts (also documented in the README); all share this password. */
export const DEMO_PASSWORD = "demo1234";
const USERNAMES = ["haru_prompt", "mina_draws", "jun_photo"] as const;
type Username = (typeof USERNAMES)[number];
/** The account /demo signs in as. */
const MAIN: Username = "haru_prompt";

/** The /demo route is a login shortcut, so it only exists on dev servers or when explicitly enabled. */
export const demoRouteEnabled = () =>
  process.env.NODE_ENV === "development" || process.env.PROMHUB_DEMO_ROUTE === "1";

const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
const hash = () => randomBytes(4).toString("hex").slice(0, 7);
const coverOf = (style: Style, n: number): PostImage | null =>
  POSTS.filter((p) => p.style === style).at(n)?.images[0] ?? null;
const result = (style: Style, n: number) => coverOf(style, n) ?? undefined;

type RepoSpec = {
  owner: Username;
  title: string;
  model: string;
  style: Style;
  visibility: "public" | "private";
  cover: PostImage | null;
  sources?: string[];
  /** Oldest first: [message, prompt, days ago, result image]. */
  commits: [string, string, number, PostImage?][];
};

const ANIME_BASE = "masterpiece, best quality, 1girl, school uniform, cherry blossoms";
const ANIME_NEG = "\nNegative prompt: lowres, bad anatomy, bad hands, watermark, text";
const WHALE_V1 = "A dreamy watercolor illustration of a whale swimming through clouds above a small seaside town";

const REPOS: RepoSpec[] = [
  {
    owner: "haru_prompt",
    title: "벚꽃길 교복 캐릭터",
    model: "Illustrious",
    style: "anime",
    visibility: "public",
    cover: coverOf("anime", 22),
    sources: [coverOf("anime", 1)?.src].filter((s): s is string => !!s),
    commits: [
      ["Initial commit", `${ANIME_BASE}${ANIME_NEG}`, 9, result("anime", 3)],
      ["포즈와 바람 추가", `${ANIME_BASE}, looking back, wind, floating hair, petals${ANIME_NEG}`, 7, result("anime", 8)],
      [
        "역광 조명으로 변경",
        `${ANIME_BASE}, looking back, wind, floating hair, petals, backlighting, golden hour${ANIME_NEG}`,
        4,
        result("anime", 7),
      ],
      [
        "배경 디테일 보강",
        `${ANIME_BASE}, looking back, wind, floating hair, petals, backlighting, golden hour, detailed background, stone path, depth of field${ANIME_NEG}`,
        1,
        result("anime", 22),
      ],
    ],
  },
  {
    owner: "haru_prompt",
    title: "젖은 콘크리트 위 이어폰 제품 사진",
    model: "Flux.1 D",
    style: "photo",
    visibility: "private",
    cover: null,
    commits: [
      ["Initial commit", "Product photo of a matte black wireless earbud case on wet concrete, neon blue rim light, 100mm macro lens", 2],
    ],
  },
  {
    owner: "mina_draws",
    title: "몽환적인 수채화 고래",
    model: "Flux.1 D",
    style: "illustration",
    visibility: "public",
    cover: coverOf("illustration", 3),
    commits: [
      ["Initial commit", WHALE_V1, 12, result("illustration", 22)],
      ["재료 느낌 구체화", `${WHALE_V1}, loose watercolor washes, visible paper grain`, 10, result("illustration", 21)],
      [
        "팔레트 지정",
        `${WHALE_V1}, loose watercolor washes, visible paper grain, soft blue and peach palette, morning light`,
        6,
        result("illustration", 3),
      ],
    ],
  },
  {
    owner: "jun_photo",
    title: "비 오는 골목의 네온 인물",
    model: "Flux.1 D",
    style: "photo",
    visibility: "public",
    cover: coverOf("photo", 9),
    commits: [
      [
        "Initial commit",
        "A person with a transparent umbrella in a rainy alley at night, neon signs reflecting on wet pavement",
        8,
        result("photo", 0),
      ],
      [
        "렌즈와 심도 지정",
        "A person with a transparent umbrella in a rainy alley at night, neon signs reflecting on wet pavement, 35mm lens, f/1.8, shallow depth of field, cinematic color grade",
        3,
        result("photo", 9),
      ],
    ],
  },
];

// Model answers for the prompt tests (scored with the real grader, not hard-coded).
const SUBMISSIONS: [string, string, number][] = [
  ["role-translator", "너는 한국어→영어 전문 번역가야. 아래 문장을 번역하고, 설명 없이 번역 결과만 출력해.\n\n{{text}}", 6],
  ["json-summary", "다음 기사를 정확히 3개의 문장으로 요약해. 서론 없이 JSON만 출력하고, 키는 summary 로 해.\n{{article}}", 5],
  ["product-photo", "Product photo of a wireless earbud case, softbox lighting, 100mm macro lens, on a wet concrete surface", 2],
];

function insertRepo(ownerId: number, spec: RepoSpec, fork?: { repoId: number; label: string }) {
  const created = ago(spec.commits[0][2]);
  const updated = ago(spec.commits.at(-1)![2]);
  const repoId = Number(
    sql(
      `INSERT INTO repos (owner_id, name, description, model, style, cover_json, visibility,
         forked_repo_id, forked_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ownerId,
      slugify(spec.title),
      spec.title,
      spec.model,
      spec.style,
      spec.cover ? JSON.stringify(spec.cover) : null,
      spec.visibility,
      fork?.repoId ?? null,
      fork?.label ?? null,
      created,
      updated,
    ).lastInsertRowid,
  );
  const insertCommit = sql(
    "INSERT INTO commits (repo_id, hash, message, prompt, image_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (const [message, prompt, days, image] of spec.commits) {
    insertCommit.run(repoId, hash(), message, prompt, image ? JSON.stringify(image) : null, ago(days));
  }
  spec.sources?.forEach((src, i) =>
    sql("INSERT INTO repo_sources (repo_id, src, link, sort_order) VALUES (?, ?, ?, ?)").run(repoId, src, src, i),
  );
  return repoId;
}

/**
 * Creates the demo accounts and their data (repos with several versions, a fork, follows,
 * likes, prompt-test submissions) and returns the main account's id. Existing demo data is
 * kept unless `reset` is set, in which case the three demo accounts are rebuilt from scratch.
 */
export function seedDemo({ reset }: { reset: boolean }): number {
  return getDb().transaction(() => {
    const existing = sql("SELECT id FROM users WHERE username = ?").get(MAIN) as { id: number } | undefined;
    if (existing && !reset) return existing.id;

    // ON DELETE CASCADE removes their sessions, repos, commits, follows, likes and submissions.
    for (const name of USERNAMES) sql("DELETE FROM users WHERE username = ?").run(name);
    const id = {} as Record<Username, number>;
    for (const name of USERNAMES) {
      id[name] = Number(
        sql("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)").run(
          name,
          hashPassword(DEMO_PASSWORD),
          ago(14),
        ).lastInsertRowid,
      );
    }

    const repo = Object.fromEntries(REPOS.map((spec) => [spec.title, insertRepo(id[spec.owner], spec)]));

    // The main account forked mina's whale and pushed one change of its own.
    const whale = REPOS.find((r) => r.owner === "mina_draws")!;
    const whaleHead = whale.commits.at(-1)!;
    insertRepo(
      id.haru_prompt,
      {
        ...whale,
        owner: "haru_prompt",
        visibility: "public",
        cover: coverOf("illustration", 19),
        commits: [
          [`Fork from mina_draws/${slugify(whale.title)}`, whaleHead[1], 5, whaleHead[3]],
          [
            "색감을 파스텔 톤으로",
            whaleHead[1].replace("soft blue and peach palette", "pastel lavender and mint palette"),
            2,
            result("illustration", 19),
          ],
        ],
      },
      { repoId: repo[whale.title], label: `mina_draws / ${slugify(whale.title)}` },
    );

    const follow = sql("INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)");
    follow.run(id.haru_prompt, id.mina_draws, ago(9));
    follow.run(id.haru_prompt, id.jun_photo, ago(6));
    follow.run(id.mina_draws, id.haru_prompt, ago(5));
    follow.run(id.jun_photo, id.mina_draws, ago(4));

    const like = sql("INSERT INTO likes (user_id, kind, target_id, created_at) VALUES (?, ?, ?, ?)");
    const animeRepo = String(repo["벚꽃길 교복 캐릭터"]);
    like.run(id.haru_prompt, "post", POSTS.find((p) => p.style === "illustration")!.id, ago(3));
    like.run(id.haru_prompt, "post", POSTS.find((p) => p.style === "photo")!.id, ago(2));
    like.run(id.haru_prompt, "repo", String(repo["비 오는 골목의 네온 인물"]), ago(1));
    like.run(id.mina_draws, "repo", animeRepo, ago(1));
    like.run(id.jun_photo, "repo", animeRepo, ago(1));

    for (const [slug, prompt, days] of SUBMISSIONS) {
      const challenge = CHALLENGES.find((c) => c.slug === slug)!;
      sql("INSERT INTO submissions (user_id, challenge_slug, prompt, score, created_at) VALUES (?, ?, ?, ?, ?)").run(
        id.haru_prompt,
        slug,
        prompt,
        scoreOf(grade(prompt, challenge.tests)),
        ago(days),
      );
    }
    return id.haru_prompt;
  })();
}
