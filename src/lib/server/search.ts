import "server-only";

import { POSTS } from "../posts";
import type { Style } from "../types";
import { listPublicOriginals } from "./repos";

export type SearchHit = { title: string; author: string; model: string; style: Style; url: string; prompt: string };

function tokens(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter((t) => t.length >= 2);
}

const toHit = (h: SearchHit) => ({ ...h, words: new Set(tokens(`${h.title} ${h.prompt}`)) });

// The Civitai snapshot never changes at runtime, so its tokens are computed once.
const POST_INDEX = POSTS.map((p) =>
  toHit({ title: p.title, author: p.author, model: p.model, style: p.style, url: `/p/${p.id}`, prompt: p.prompt }),
);

/** Keyword search over public prompts: Civitai snapshot + users' public original repos. */
export function searchPromHub(query: string, style: Style | null, limit = 5): SearchHit[] {
  const terms = tokens(query);
  if (terms.length === 0) return [];

  const repoIndex = listPublicOriginals().map((r) =>
    toHit({
      title: r.description,
      author: r.owner,
      model: r.model,
      style: r.style,
      url: `/repos/${r.id}`,
      prompt: r.headPrompt,
    }),
  );

  return [...repoIndex, ...POST_INDEX]
    .filter((c) => !style || c.style === style)
    .map((c) => ({ c, score: terms.filter((t) => c.words.has(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ c }) => ({
      title: c.title,
      author: c.author,
      model: c.model,
      style: c.style,
      url: c.url,
      prompt: c.prompt.slice(0, 400),
    }));
}

/** Most-liked Civitai posts in a style — a fallback when keyword search finds nothing. */
export function popularInStyle(style: Style, limit = 3): SearchHit[] {
  return POSTS.filter((p) => p.style === style)
    .sort((a, b) => b.likes - a.likes)
    .slice(0, limit)
    .map((p) => ({
      title: p.title,
      author: p.author,
      model: p.model,
      style: p.style,
      url: `/p/${p.id}`,
      prompt: p.prompt.slice(0, 400),
    }));
}
