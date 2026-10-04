import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions";
import { LikeButton } from "@/components/LikeButton";
import { PageHeading } from "@/components/PageHeading";
import { RepoListItem } from "@/components/RepoListItem";
import { StyleTag } from "@/components/StyleTag";
import { UserList } from "@/components/UserList";
import { VisibilityToggle } from "@/components/VisibilityToggle";
import { getPost } from "@/lib/posts";
import { requireUser } from "@/lib/server/auth";
import { getRepo, listUserRepos } from "@/lib/server/repos";
import { followCounts, likeInfo, listFollows, listLikes } from "@/lib/server/social";
import { testSummary } from "@/lib/server/submissions";
import type { PostImage, Style } from "@/lib/types";

const TABS = [
  { value: "original", label: "내가 오픈한 프롬프트" },
  { value: "fork", label: "포크한 프롬프트" },
  { value: "likes", label: "좋아요" },
  { value: "followers", label: "팔로워" },
  { value: "following", label: "팔로잉" },
] as const;
type Tab = (typeof TABS)[number]["value"];

type LikedItem = {
  kind: "post" | "repo";
  id: string;
  href: string;
  title: string;
  meta: string;
  style: Style;
  cover: PostImage | null;
};

/** Resolves saved works; repos that were deleted or made private since are skipped. */
function likedItems(userId: number): LikedItem[] {
  return listLikes(userId).flatMap(({ kind, targetId }): LikedItem[] => {
    if (kind === "post") {
      const post = getPost(targetId);
      if (!post) return [];
      const meta = `@${post.author} · ${post.model} · Civitai`;
      return [{ kind, id: targetId, href: `/p/${post.id}`, title: post.title, meta, style: post.style, cover: post.images[0] }];
    }
    const repo = getRepo(Number(targetId), userId);
    if (!repo) return [];
    const meta = `${repo.model} · v${repo.commitCount}`;
    const title = `${repo.owner} / ${repo.name}`;
    return [{ kind, id: targetId, href: `/repos/${repo.id}`, title, meta, style: repo.style, cover: repo.cover }];
  });
}

export default async function MyPage(props: PageProps<"/me">) {
  const user = await requireUser("/me");
  const { tab } = await props.searchParams;
  const current: Tab = TABS.some((t) => t.value === tab) ? (tab as Tab) : "original";

  const repos = listUserRepos(user.id);
  const originals = repos.filter((r) => !r.forkedLabel);
  const forks = repos.filter((r) => r.forkedLabel);
  const liked = likedItems(user.id);
  const followers = listFollows(user.id, "followers");
  const following = listFollows(user.id, "following");
  const counts = followCounts(user.id);
  const tests = testSummary(user.id);
  const tabCount: Record<Tab, number> = {
    original: originals.length,
    fork: forks.length,
    likes: liked.length,
    followers: counts.followers,
    following: counts.following,
  };

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 py-12 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <PageHeading eyebrow="My page" title={`@${user.username}`} className="break-all" />
          <p className="label-mono mt-4 text-secondary">
            <Link href="/me?tab=followers" className="link-hover">
              팔로워 <span className="text-white">{counts.followers}</span>
            </Link>{" "}
            ·{" "}
            <Link href="/me?tab=following" className="link-hover">
              팔로잉 <span className="text-white">{counts.following}</span>
            </Link>{" "}
            ·{" "}
            <Link href={`/u/${user.username}`} className="link-hover">
              공개 프로필 보기
            </Link>
          </p>
        </div>
        <form action={logout}>
          <button className="btn-slate">Log out</button>
        </form>
      </div>

      {/* Prompt test banner — a saturated ultraviolet tile, like a coding-test dashboard. */}
      <section className="mt-10 flex flex-wrap items-center gap-6 rounded-feature bg-ultraviolet p-6 sm:p-8">
        <div className="min-w-0 flex-1">
          <p className="label-mono tracking-[1.8px] text-white/80">Prompt Test</p>
          <p className="mt-2 text-[28px] font-bold leading-tight">
            {tests.solved} / {tests.total} 문제 해결
          </p>
          <div className="mt-4 h-2 max-w-md overflow-hidden rounded-full bg-white/20">
            <div className="h-full bg-mint" style={{ width: `${(tests.solved / tests.total) * 100}%` }} />
          </div>
          {tests.next && (
            <p className="mt-3 text-sm text-white/80">
              다음 추천 문제 · Lv.{tests.next.level} {tests.next.title}
            </p>
          )}
        </div>
        <Link href={tests.next ? `/tests/${tests.next.slug}` : "/tests"} className="btn-mint">
          {tests.next ? "도전하기" : "문제 목록"}
        </Link>
      </section>

      <div className="mt-12 flex gap-6 overflow-x-auto border-b border-frame">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/me?tab=${t.value}`}
            className={`label-mono shrink-0 whitespace-nowrap pb-3 text-xs tracking-[1.8px] ${
              current === t.value
                ? "text-mint shadow-[inset_0_-1px_0_0_var(--color-mint)]"
                : "text-secondary hover:text-link-hover"
            }`}
          >
            {t.label} · {tabCount[t.value]}
          </Link>
        ))}
      </div>

      {(current === "original" || current === "fork") &&
        ((current === "fork" ? forks : originals).length === 0 ? (
          <div className="mt-8 rounded-tile border border-frame px-6 py-12 text-center">
            <p className="text-muted">
              {current === "fork" ? "아직 포크한 프롬프트가 없어요." : "아직 오픈한 프롬프트가 없어요."}
            </p>
            <Link href={current === "fork" ? "/" : "/new"} className="btn-mint mt-5 inline-block">
              {current === "fork" ? "프롬프트 둘러보기" : "New Prompt"}
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {(current === "fork" ? forks : originals).map((repo) => (
              <RepoListItem
                key={repo.id}
                repo={repo}
                trailing={<VisibilityToggle repoId={repo.id} visibility={repo.visibility} />}
              />
            ))}
          </ul>
        ))}

      {current === "likes" &&
        (liked.length === 0 ? (
          <div className="mt-8 rounded-tile border border-frame px-6 py-12 text-center">
            <p className="text-muted">마음에 드는 작품에 ♡ 좋아요를 누르면 여기에 보관돼요.</p>
            <Link href="/" className="btn-mint mt-5 inline-block">
              작품 둘러보기
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {liked.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center gap-4 rounded-tile border border-frame p-3">
                <Link href={item.href} className="group flex min-w-0 flex-1 items-center gap-4">
                  {item.cover ? (
                    <Image src={item.cover.src} alt="" width={64} height={64} className="size-16 shrink-0 rounded-img object-cover" />
                  ) : (
                    <div className="size-16 shrink-0 rounded-img bg-slate" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-bold transition-colors duration-150 group-hover:text-link-hover">
                      {item.title}
                    </p>
                    <p className="label-mono mt-1.5 truncate font-normal text-secondary">{item.meta}</p>
                  </div>
                </Link>
                <span className="hidden sm:block">
                  <StyleTag style={item.style} />
                </span>
                <LikeButton kind={item.kind} targetId={item.id} liked count={likeInfo(item.kind, item.id, null).count} signedIn />
              </li>
            ))}
          </ul>
        ))}

      {current === "followers" && <UserList users={followers} empty="아직 나를 팔로우하는 사람이 없어요." />}
      {current === "following" && <UserList users={following} empty="아직 팔로우하는 사람이 없어요." />}
    </main>
  );
}
