import Form from "next/form";
import Link from "next/link";
import { connection } from "next/server";
import { Feed } from "@/components/Feed";
import { matchesQuery, searchQuery } from "@/lib/feed-search";
import { POSTS } from "@/lib/posts";
import { getCurrentUser } from "@/lib/server/auth";
import { listFollowingRepos, listPublicOriginals, type RepoSummary } from "@/lib/server/repos";
import { timeAgo } from "@/lib/time-ago";
import type { FeedItem } from "@/lib/types";
import { PageHeading } from "@/components/PageHeading";
import { fieldClass } from "@/components/ui";

// Enough for the card's 6-line clamp; the rest of the prompt never reaches the client.
const EXCERPT_CHARS = 280;

const repoItem = (r: RepoSummary, activity?: string): FeedItem => ({
  key: `repo-${r.id}`,
  href: `/repos/${r.id}`,
  title: r.description,
  author: r.owner,
  style: r.style,
  cover: r.cover,
  likes: null,
  excerpt: r.cover ? null : r.headPrompt.slice(0, EXCERPT_CHARS),
  activity,
});

export default async function Home(props: PageProps<"/">) {
  // better-sqlite3 is synchronous; skip prerendering so the query runs per request.
  await connection();
  const sp = await props.searchParams;
  const q = searchQuery(sp.q);
  const following = sp.feed === "following";
  const user = following ? await getCurrentUser() : null;
  const hit = (...fields: string[]) => !q || matchesQuery(q, fields);
  const repoHit = (r: RepoSummary) => hit(r.description, r.owner, r.model, r.headPrompt);

  let items: FeedItem[];
  if (following) {
    items = user
      ? listFollowingRepos(user.id)
          .filter(repoHit)
          .map((r) => repoItem(r, `v${r.commitCount} · ${timeAgo(r.updatedAt)}`))
      : [];
  } else {
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
    items = [...listPublicOriginals().filter(repoHit).map((r) => repoItem(r)), ...civitai];
  }

  const tabHref = (feed: string | null) => {
    const params = new URLSearchParams();
    if (feed) params.set("feed", feed);
    if (q) params.set("q", q);
    return params.size ? `/?${params}` : "/";
  };
  const empty = following
    ? !user
      ? { text: "로그인하면 팔로우한 사람들의 최근 프롬프트를 모아 볼 수 있어요.", link: { href: "/login?next=%2F%3Ffeed%3Dfollowing", label: "로그인" } }
      : q
        ? { text: "팔로잉 피드에 일치하는 프롬프트가 없습니다.", link: null }
        : { text: "아직 팔로우한 사람이 없거나, 공개한 프롬프트가 없어요. 둘러보기에서 마음에 드는 작성자를 팔로우해 보세요.", link: { href: tabHref(null), label: "둘러보기" } }
    : { text: "일치하는 프롬프트가 없습니다. 다른 단어로 검색해 보세요.", link: null };

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 lg:px-12">
      <section className="py-12 lg:py-16">
        <PageHeading eyebrow="Version control for your prompts" title="Prompts that ship." size="hero" />
      </section>
      {/* The header search box is desktop-only; small screens get this one above the feed. */}
      <Form action="/" role="search" className="mb-6 lg:hidden">
        {following && <input type="hidden" name="feed" value="following" />}
        <input key={q} type="search" name="q" defaultValue={q} placeholder="Search prompts" aria-label="프롬프트 검색" maxLength={100} className={fieldClass} />
      </Form>
      <nav aria-label="피드 종류" className="mb-6 flex gap-2">
        {[
          { feed: null, label: "둘러보기", active: !following },
          { feed: "following", label: "팔로잉", active: following },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tabHref(tab.feed)}
            aria-current={tab.active ? "page" : undefined}
            className={`label-mono rounded-pill border px-4 py-2 transition-colors duration-150 ${
              tab.active ? "border-mint text-mint" : "border-frame text-secondary hover:border-secondary"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {q && (
        <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-[19px]">
            <span className="text-mint">&ldquo;{q}&rdquo;</span> 검색 결과 {items.length}건
          </p>
          <Link href={following ? "/?feed=following" : "/"} className="label-mono link-hover text-xs text-secondary">
            검색 지우기
          </Link>
        </div>
      )}
      {items.length === 0 ? (
        <div className="border-t border-frame py-16 text-center text-secondary">
          <p>{empty.text}</p>
          {empty.link && (
            <Link href={empty.link.href} className="btn-mint mt-6 inline-block">
              {empty.link.label}
            </Link>
          )}
        </div>
      ) : (
        <Feed items={items} />
      )}
    </main>
  );
}
