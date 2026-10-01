import { connection } from "next/server";
import { Feed } from "@/components/Feed";
import { POSTS } from "@/lib/posts";
import { listPublicOriginals } from "@/lib/server/repos";
import type { FeedItem } from "@/lib/types";

export default async function Home() {
  // better-sqlite3 is synchronous; skip prerendering so the query runs per request.
  await connection();
  const userPrompts: FeedItem[] = listPublicOriginals().map((r) => ({
    key: `repo-${r.id}`,
    href: `/repos/${r.id}`,
    title: r.description,
    author: r.owner,
    style: r.style,
    cover: r.cover,
    likes: null,
    excerpt: r.headPrompt,
  }));
  const civitai: FeedItem[] = POSTS.map((p) => ({
    key: `post-${p.id}`,
    href: `/p/${p.id}`,
    title: p.title,
    author: p.author,
    style: p.style,
    cover: p.images[0],
    likes: p.likes,
    excerpt: p.prompt,
  }));

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 lg:px-12">
      <section className="py-12 lg:py-16">
        <p className="text-[19px] font-light uppercase leading-[1.2] tracking-[1.9px] text-secondary">
          Version control for your prompts
        </p>
        <h1 className="mt-4 font-display text-[54px] uppercase leading-[0.95] tracking-[1.07px] sm:text-[90px] lg:text-[107px]">
          Prompts that ship.
        </h1>
      </section>
      <Feed items={[...userPrompts, ...civitai]} />
    </main>
  );
}
