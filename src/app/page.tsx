import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Feed } from "@/components/Feed";
import { matchesQuery, searchQuery } from "@/lib/feed-search";
import { POSTS } from "@/lib/posts";
import { listPublicOriginals } from "@/lib/server/repos";
import type { FeedItem } from "@/lib/types";
import { PageHeading } from "@/components/PageHeading";
import { fieldClass } from "@/components/ui";

// Enough for the card's 6-line clamp; the rest of the prompt never reaches the client.
const EXCERPT_CHARS = 280;

export default async function Home(props: PageProps<"/">) {
  // better-sqlite3 is synchronous; skip prerendering so the query runs per request.
  await connection();
  const q = searchQuery((await props.searchParams).q);
  const hit = (...fields: string[]) => !q || matchesQuery(q, fields);

  const userPrompts: FeedItem[] = listPublicOriginals()
    .filter((r) => hit(r.description, r.owner, r.model, r.headPrompt))
    .map((r) => ({
      key: `repo-${r.id}`,
      href: `/repos/${r.id}`,
      title: r.description,
      author: r.owner,
      style: r.style,
      cover: r.cover,
      likes: null,
      excerpt: r.cover ? null : r.headPrompt.slice(0, EXCERPT_CHARS),
    }));
  const civitai: FeedItem[] = POSTS.filter((p) => hit(p.title, p.author, p.model, p.prompt)).map((p) => ({
    key: `post-${p.id}`,
    href: `/p/${p.id}`,
    title: p.title,
    author: p.author,
    style: p.style,
    cover: p.images[0],
    likes: p.likes,
    excerpt: null,
  }));
  const items = [...userPrompts, ...civitai];

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 lg:px-12">
      <section className="py-12 lg:py-16">
        <PageHeading eyebrow="Version control for your prompts" title="Prompts that ship." size="hero" />
      </section>
      {/* The header search box is desktop-only; small screens get this one above the feed. */}
      <Form action="/" role="search" className="mb-6 lg:hidden">
        <input key={q} type="search" name="q" defaultValue={q} placeholder="Search prompts" aria-label="프롬프트 검색" maxLength={100} className={fieldClass} />
      </Form>
      {q && (
        <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-[19px]">
            <span className="text-mint">&ldquo;{q}&rdquo;</span> 검색 결과 {items.length}건
          </p>
          <Link href="/" className="label-mono link-hover text-xs text-secondary">
            검색 지우기
          </Link>
        </div>
      )}
      {q && items.length === 0 ? (
        <p className="border-t border-frame py-16 text-center text-secondary">
          일치하는 프롬프트가 없습니다. 다른 단어로 검색해 보세요.
        </p>
      ) : (
        <Feed items={items} />
      )}
    </main>
  );
}
