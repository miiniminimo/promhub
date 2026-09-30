export type Style = "anime" | "photo" | "illustration";

export type PostImage = { src: string; width: number; height: number };

export type Post = {
  id: string;
  title: string;
  author: string;
  /** Base model the result was generated with, e.g. "Flux.1 D". */
  model: string;
  style: Style;
  /** Result images (first one is the cover). */
  images: PostImage[];
  prompt: string;
  negativePrompt: string | null;
  params: {
    sampler: string | null;
    steps: number | null;
    cfgScale: number | null;
    seed: number | null;
  };
  likes: number;
  createdAt: string;
  sourceUrl: string;
};


/** A card in the explore feed — either a Civitai post or a user's public prompt repo. */
export type FeedItem = {
  key: string;
  href: string;
  title: string;
  author: string;
  style: Style;
  cover: PostImage | null;
  likes: number | null;
  excerpt: string;
};
