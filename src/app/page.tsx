import { connection } from "next/server";
import { Feed } from "@/components/Feed";
import { POSTS } from "@/lib/posts";
import { listPublicOriginals } from "@/lib/server/repos";
import type { FeedItem } from "@/lib/types";
import { PageHeading } from "@/components/PageHeading";

// Enough for the card's 6-line clamp; the rest of the prompt never reaches the client.
const EXCERPT_CHARS = 280;

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
    excerpt: r.cover ? null : r.headPrompt.slice(0, EXCERPT_CHARS),
  }));
  const civitai: FeedItem[] = POSTS.map((p) => ({
    key: `post-${p.id}`,
    href: `/p/${p.id}`,
    title: p.title,
    author: p.author,
    style: p.style,
    cover: p.images[0],
    likes: p.likes,
    excerpt: null,
  }));

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 lg:px-12">
      <section className="py-12 lg:py-16">
        <PageHeading eyebrow="Version control for your prompts" title="Prompts that ship." size="hero" />
      </section>
      <Feed items={[...userPrompts, ...civitai]} />
    </main>
  );
}
