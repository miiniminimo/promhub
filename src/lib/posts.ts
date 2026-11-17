import civitai from "@/data/civitai.json";
import type { Post } from "./types";

// Snapshot from the Civitai public API — regenerate with `node scripts/fetch-civitai.mjs`.
export const POSTS = civitai as Post[];

/** Civitai authors aren't PromHub users, so their name links to their Civitai profile. */
export const civitaiProfileUrl = (author: string) => `https://civitai.com/user/${encodeURIComponent(author)}`;

export function getPost(id: string) {
  return POSTS.find((p) => p.id === id);
}
