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

/** Keyword search over public prompts: Civitai snapshot + users' public original repos. */
export function searchPromHub(query: string, style: Style | null, limit = 5): SearchHit[] {
  const terms = new Set(tokens(query));
  if (terms.size === 0) return [];

  const candidates: SearchHit[] = [
    ...listPublicOriginals().map((r) => ({
      title: r.description,
      author: r.owner,
      model: r.model,
      style: r.style,
      url: `/repos/${r.id}`,
      prompt: r.headPrompt,
    })),
    ...POSTS.map((p) => ({
      title: p.title,
      author: p.author,
      model: p.model,
      style: p.style,
      url: `/p/${p.id}`,
      prompt: p.prompt,
    })),
  ];

  return candidates
    .filter((c) => !style || c.style === style)
    .map((c) => {
      const words = tokens(`${c.title} ${c.prompt}`);
      return { c, score: words.filter((w) => terms.has(w)).length };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ c }) => ({ ...c, prompt: c.prompt.slice(0, 400) }));
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
