import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommitForm } from "@/components/CommitForm";
import { ForkButton } from "@/components/ForkButton";
import { PromptBlock } from "@/components/PromptBlock";
import { StyleTag } from "@/components/StyleTag";
import { VisibilityBadge } from "@/components/VisibilityBadge";
import { VisibilityToggle } from "@/components/VisibilityToggle";
import { getCurrentUser } from "@/lib/server/auth";
import { getCommits, getRepo, getSources } from "@/lib/server/repos";

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function RepoPage(props: PageProps<"/repos/[id]">) {
  const { id } = await props.params;
  const { v, edit } = await props.searchParams;
  const user = await getCurrentUser();
  const repo = getRepo(Number(id), user?.id ?? null);
  if (!repo) notFound();

  const isOwner = user?.id === repo.ownerId;
  const commits = getCommits(repo.id);
  const sources = getSources(repo.id);
  const head = commits.length - 1;
  const requested = Number(v) - 1;
  const selected = Number.isInteger(requested) && requested >= 0 && requested <= head ? requested : head;
  const viewing = commits[selected];
  const editing = isOwner && edit === "1";

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 py-10 lg:px-12">
      <header className="flex flex-wrap items-start gap-5 border-b border-frame pb-8">
        {repo.cover && (
          <Image
            src={repo.cover.src}
            alt=""
            width={96}
            height={96}
            className="size-24 rounded-tile border border-frame object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="break-all font-mono text-2xl font-bold">
            <span className="text-secondary">{repo.owner}</span> / {repo.name}
          </h1>
          <p className="mt-1.5 text-muted">{repo.description}</p>
          {repo.forkedLabel && (
            <p className="label-mono mt-2 font-normal text-secondary">
              ⑂ forked from{" "}
              <Link
                href={repo.forkedPostId ? `/p/${repo.forkedPostId}` : `/repos/${repo.forkedRepoId}`}
                className="link-hover text-muted underline"
              >
                {repo.forkedLabel}
              </Link>
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StyleTag style={repo.style} />
            <span className="label-mono text-secondary">사용 모델 · {repo.model}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isOwner ? (
            <VisibilityToggle repoId={repo.id} visibility={repo.visibility} />
          ) : (
            <>
              <VisibilityBadge visibility={repo.visibility} />
              <div className="w-64">
                <ForkButton repoId={repo.id} />
              </div>
            </>
          )}
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          {editing ? (
            <CommitForm repoId={repo.id} prompt={commits[head].prompt} negativePrompt={commits[head].negativePrompt} />
          ) : (
            <div className="space-y-4">
              <div className="flex min-h-9 items-center justify-between gap-4">
                <p className="label-mono text-secondary">
                  v{selected + 1} · {viewing.hash}
                  {selected === head && <span className="ml-2 text-mint">HEAD</span>}
                </p>
                {isOwner && (
                  <Link href={`/repos/${repo.id}?edit=1`} className="btn-mint">
                    수정하기
                  </Link>
                )}
              </div>
              <PromptBlock label="Prompt" text={viewing.prompt} />
              {viewing.negativePrompt && <PromptBlock label="Negative prompt" text={viewing.negativePrompt} />}
            </div>
          )}
        </section>

        <aside className="space-y-10">
          {sources.length > 0 && (
            <section>
              <h2 className="label-mono border-b border-frame pb-3 text-secondary">Source images · {sources.length}</h2>
              <ul className="mt-4 grid grid-cols-4 gap-3 lg:grid-cols-2">
                {sources.map((s, i) => (
                  <li key={s.src}>
                    <a href={s.link ?? s.src} target="_blank" rel="noreferrer" className="group block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- may be an arbitrary external host */}
                      <img
                        src={s.src}
                        alt={`소스 이미지 ${i + 1}`}
                        referrerPolicy="no-referrer"
                        loading="lazy"
                        className="aspect-square w-full rounded-img border border-frame object-cover"
                      />
                      <span className="label-mono mt-1.5 block truncate font-normal text-secondary transition-colors duration-150 group-hover:text-link-hover">
                        {s.link ? `↗ ${new URL(s.link).hostname}` : "업로드한 파일"}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="label-mono border-b border-frame pb-3 text-secondary">History · {commits.length} commits</h2>
            <ol className="mt-4 space-y-3 border-l border-purple-rule pl-4">
              {commits
                .map((commit, i) => ({ commit, i }))
                .reverse()
                .map(({ commit, i }) => (
                  <li key={commit.id}>
                    <Link
                      href={`/repos/${repo.id}?v=${i + 1}`}
                      className={`block rounded-tile border px-4 py-3 transition-colors duration-150 ${
                        i === selected && !editing ? "border-mint" : "border-frame hover:border-secondary"
                      }`}
                    >
                      <p className="label-mono text-secondary">
                        v{i + 1} · {commit.hash} · {formatTime(commit.createdAt)}
                      </p>
                      <p className="mt-1.5 text-[15px] font-bold">{commit.message}</p>
                    </Link>
                  </li>
                ))}
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}
