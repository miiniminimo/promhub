import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions";
import { StyleTag } from "@/components/StyleTag";
import { VisibilityToggle } from "@/components/VisibilityToggle";
import { requireUser } from "@/lib/server/auth";
import { listUserRepos, type RepoSummary } from "@/lib/server/repos";
import { testSummary } from "@/lib/server/submissions";
import { PageHeading } from "@/components/PageHeading";

const TABS = [
  { value: "original", label: "내가 오픈한 프롬프트" },
  { value: "fork", label: "포크한 프롬프트" },
] as const;

export default async function MyPage(props: PageProps<"/me">) {
  const user = await requireUser("/me");
  const { tab } = await props.searchParams;
  const current = tab === "fork" ? "fork" : "original";

  const repos = listUserRepos(user.id);
  const originals = repos.filter((r) => !r.forkedLabel);
  const forks = repos.filter((r) => r.forkedLabel);
  const shown = current === "fork" ? forks : originals;
  const tests = testSummary(user.id);

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 py-12 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <PageHeading eyebrow="My page" title={`@${user.username}`} className="break-all" />
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

      <div className="mt-12 flex gap-6 border-b border-frame">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={`/me?tab=${t.value}`}
            className={`label-mono pb-3 text-xs tracking-[1.8px] ${
              current === t.value
                ? "text-mint shadow-[inset_0_-1px_0_0_var(--color-mint)]"
                : "text-secondary hover:text-link-hover"
            }`}
          >
            {t.label} · {t.value === "fork" ? forks.length : originals.length}
          </Link>
        ))}
      </div>

      {shown.length === 0 ? (
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
          {shown.map((repo) => (
            <RepoRow key={repo.id} repo={repo} />
          ))}
        </ul>
      )}
    </main>
  );
}

function RepoRow({ repo }: { repo: RepoSummary }) {
  return (
    <li className="flex items-center gap-4 rounded-tile border border-frame p-3">
      <Link href={`/repos/${repo.id}`} className="group flex min-w-0 flex-1 items-center gap-4">
        {repo.cover ? (
          <Image src={repo.cover.src} alt="" width={64} height={64} className="size-16 shrink-0 rounded-img object-cover" />
        ) : (
          <div className="size-16 shrink-0 rounded-img bg-slate" />
        )}
        <div className="min-w-0">
          <p className="truncate font-mono text-[15px] font-bold transition-colors duration-150 group-hover:text-link-hover">
            {repo.owner} / {repo.name}
          </p>
          <p className="label-mono mt-1.5 truncate font-normal text-secondary">
            {repo.model} · v{repo.commitCount}
            {repo.forkedLabel && ` · forked from ${repo.forkedLabel}`}
          </p>
        </div>
      </Link>
      <span className="hidden sm:block">
        <StyleTag style={repo.style} />
      </span>
      <VisibilityToggle repoId={repo.id} visibility={repo.visibility} />
    </li>
  );
}
