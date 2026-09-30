// Snapshot SFW images + prompts from the Civitai public API into src/data/civitai.json.
// Usage: node scripts/fetch-civitai.mjs
import { writeFile } from "node:fs/promises";

const API = "https://civitai.com/api/v1/images";
const QUERIES = [
  "sort=Most%20Reactions&period=Week",
  "sort=Most%20Reactions&period=Month",
  "sort=Most%20Reactions&period=Year",
  "sort=Most%20Reactions&period=AllTime",
];
const MAX_POSTS = 60;
const MAX_PER_MODEL = 8;
const MAX_IMAGES_PER_POST = 6;

const resized = (url, width) => url.replace(/\/original=true\//, `/width=${width}/`);

// Quality/booru boilerplate that makes a poor title.
const NOISE = /^(score_\w+|masterpiece|best quality|high quality|amazing quality|very aesthetic|aesthetic|absurdres|highres|newest|ultra[- ]detailed|8k|4k|detailed|solo|\d+(girl|boy)s?)$/i;

function toTitle(prompt) {
  const cleaned = prompt
    .replace(/<[^>]+>/g, " ") // <lora:...>
    .replace(/[()[\]{}]|:\d+(\.\d+)?/g, " ") // weight syntax
    .replace(/\s+/g, " ");
  const clauses = cleaned.split(/[.,\n]/).map((c) => c.trim()).filter((c) => c && !NOISE.test(c));
  const sentence = clauses.find((c) => c.split(" ").length >= 4);
  const text = sentence ?? clauses.slice(0, 4).join(", ");
  const words = text.split(" ");
  return words.length > 8 ? `${words.slice(0, 8).join(" ")}…` : text;
}

// Rough style classifier: keyword hits in the prompt + a prior for anime-tuned base models.
const ANIME_MODELS = new Set(["Pony", "Illustrious", "NoobAI", "Anima"]);
const STYLE_KEYWORDS = {
  anime: /\b(anime|manga|chibi|\d+(girl|boy)s?|genshin|waifu|booru|cel[- ]shad\w*|kawaii)\b/gi,
  photo: /\b(photo\w*|realistic|photorealistic|hyperrealistic|dslr|35mm|50mm|85mm|film grain|bokeh|cinematic|depth of field|raw photo|skin texture)\b/gi,
  illustration: /\b(illustration|painting|painted|watercolou?r|ink|concept art|poster|art by|by [A-Z]\w+|digital art|sketch|drawing|oil|gouache|print|infographic|fantasy art|artstation|duotone|moebius)\b/gi,
};

function classifyStyle(prompt, baseModel) {
  const score = Object.fromEntries(
    Object.entries(STYLE_KEYWORDS).map(([style, re]) => [style, prompt.match(re)?.length ?? 0]),
  );
  if (ANIME_MODELS.has(baseModel)) score.anime += 2;
  const [best, hits] = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return hits > 0 ? best : "illustration";
}

const images = new Map();
for (const q of QUERIES) {
  const res = await fetch(`${API}?limit=200&nsfw=None&withMeta=true&${q}`);
  if (!res.ok) throw new Error(`${res.status} for ${q}`);
  const { items } = await res.json();
  for (const item of items) {
    const prompt = item.meta?.prompt?.trim();
    if (!prompt || item.type !== "image" || item.nsfwLevel !== "None" || !item.baseModel) continue;
    images.set(item.id, item);
  }
}

const byPost = new Map();
for (const item of images.values()) {
  const list = byPost.get(item.postId) ?? [];
  list.push(item);
  byPost.set(item.postId, list);
}

const perModel = new Map();
const posts = [];
const sortedPosts = [...byPost.values()].sort(
  (a, b) => b[0].stats.likeCount + b[0].stats.heartCount - (a[0].stats.likeCount + a[0].stats.heartCount),
);
for (const group of sortedPosts) {
  const first = group[0];
  const count = perModel.get(first.baseModel) ?? 0;
  if (count >= MAX_PER_MODEL) continue;
  perModel.set(first.baseModel, count + 1);

  const m = first.meta;
  posts.push({
    id: String(first.postId),
    title: toTitle(m.prompt),
    author: first.username,
    model: first.baseModel,
    style: classifyStyle(m.prompt, first.baseModel),
    images: group.slice(0, MAX_IMAGES_PER_POST).map((img) => ({
      src: resized(img.url, 600),
      width: img.width,
      height: img.height,
    })),
    prompt: m.prompt,
    negativePrompt: m.negativePrompt ?? null,
    params: {
      sampler: m.sampler ?? null,
      steps: m.steps ?? null,
      cfgScale: m.cfgScale ?? null,
      seed: m.seed ?? null,
    },
    likes: group.reduce((sum, img) => sum + img.stats.likeCount + img.stats.heartCount, 0),
    createdAt: first.createdAt,
    sourceUrl: `https://civitai.com/posts/${first.postId}`,
  });
  if (posts.length >= MAX_POSTS) break;
}

await writeFile(new URL("../src/data/civitai.json", import.meta.url), JSON.stringify(posts, null, 2) + "\n");
console.log(`Saved ${posts.length} posts`, Object.fromEntries(perModel));
