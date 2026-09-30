import Image from "next/image";
import Link from "next/link";
import { logout } from "@/app/actions";
import { StyleTag } from "@/components/StyleTag";
import { VisibilityToggle } from "@/components/VisibilityToggle";
import { requireUser } from "@/lib/server/auth";
import { listUserRepos, type RepoSummary } from "@/lib/server/repos";

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

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 py-12 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[19px] font-light uppercase tracking-[1.9px] text-secondary">My page</p>
          <h1 className="mt-3 break-all font-display text-[54px] uppercase leading-[0.95] tracking-[1.07px] sm:text-[90px]">
            @{user.username}
          </h1>
        </div>
        <form action={logout}>
          <button className="label-mono rounded-[24px] bg-slate px-5 py-2 leading-[2] text-muted">Log out</button>
        </form>
      </div>

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
