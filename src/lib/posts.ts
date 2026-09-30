import civitai from "@/data/civitai.json";
import type { Post } from "./types";

// Snapshot from the Civitai public API — regenerate with `node scripts/fetch-civitai.mjs`.
export const POSTS = civitai as Post[];

export function getPost(id: string) {
  return POSTS.find((p) => p.id === id);
}
