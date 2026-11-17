import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommitForm } from "@/components/CommitForm";
import { ForkButton } from "@/components/ForkButton";
import { GenerateResultImage } from "@/components/GenerateResultImage";
import { LikeButton } from "@/components/LikeButton";
import { ModelCard } from "@/components/ModelCard";
import { PromptBlock } from "@/components/PromptBlock";
import { PromptDiff } from "@/components/PromptDiff";
import { ResultImage } from "@/components/ResultImage";
import { StyleTag } from "@/components/StyleTag";
import { VisibilityToggle } from "@/components/VisibilityToggle";
import { getCurrentUser } from "@/lib/server/auth";
import { previewAvailable } from "@/lib/server/image-gen";
import { getCommits, getRepo, getSources } from "@/lib/server/repos";
import { likeInfo } from "@/lib/server/social";

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
  const { v, edit, diff, autogen } = await props.searchParams;
  const user = await getCurrentUser();
  const repo = getRepo(Number(id), user?.id ?? null);
  if (!repo) notFound();

  const isOwner = user?.id === repo.ownerId;
  const commits = getCommits(repo.id);
  const sources = getSources(repo.id);
  const head = commits.length - 1;
  /** `?v=` / `?diff=` are 1-based version numbers; anything out of range is ignored. */
  const versionIndex = (param: unknown) => {
    const i = Number(param) - 1;
    return Number.isInteger(i) && i >= 0 && i <= head ? i : null;
  };
  // Other people only see the latest version; history, old versions and diffs are the owner's.
  const selected = (isOwner ? versionIndex(v) : null) ?? head;
  const viewing = commits[selected];
  const diffIndex = isOwner ? versionIndex(diff) : null;
  const base = diffIndex !== null && diffIndex !== selected ? diffIndex : null;
  const editing = isOwner && edit === "1";
  const like = likeInfo("repo", String(repo.id), user?.id ?? null);

  const versionLink = (n: number, extra = "") => `/repos/${repo.id}?v=${n}${extra}`;

  return (
    // Same layout as a community post (/p/[id]): the result on the left, details on the right.
    <main className="mx-auto grid w-full max-w-[1300px] gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-12">
      <div className="min-w-0 space-y-4">
        {editing ? (
          <CommitForm
            repoId={repo.id}
            prompt={commits[head].prompt}
            style={repo.style}
            model={repo.model}
            version={head + 1}
            previewEnabled={previewAvailable()}
          />
        ) : base !== null ? (
          <>
            <Form action={`/repos/${repo.id}`} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="v" value={selected + 1} />
              <label htmlFor="diff-base" className="label-mono text-secondary">
                비교 기준
              </label>
              <select
                id="diff-base"
                name="diff"
                defaultValue={base + 1}
                key={base}
                className="rounded-tag border border-secondary bg-canvas px-2 py-1.5 font-mono text-[13px] focus:border-mint focus:outline-none"
              >
                {commits.map((c, i) =>
                  i === selected ? null : (
                    <option key={c.id} value={i + 1}>
                      v{i + 1} · {c.message}
                    </option>
                  ),
                )}
              </select>
              <button type="submit" className="label-mono link-hover text-mint">
                비교
              </button>
            </Form>
            {(commits[base].image || viewing.image) && (
              <div className="grid grid-cols-2 gap-4">
                <ResultImage image={commits[base].image} caption={`v${base + 1} 결과`} />
                <ResultImage image={viewing.image} caption={`v${selected + 1} 결과`} />
              </div>
            )}
            <PromptDiff label={`v${base + 1} → v${selected + 1}`} before={commits[base].prompt} after={viewing.prompt} />
          </>
        ) : viewing.image ? (
          <figure>
            <Image
              src={viewing.image.src}
              alt={`${repo.description} v${selected + 1}`}
              width={viewing.image.width}
              height={viewing.image.height}
              loading="eager"
              className="mx-auto h-auto max-h-[85vh] w-auto rounded-tile border border-frame"
            />
            {viewing.image.generatedBy && (
              <figcaption className="label-mono mt-2 text-center font-normal normal-case text-secondary">
                {viewing.image.generatedBy}로 생성한 미리보기
              </figcaption>
            )}
          </figure>
        ) : isOwner ? (
          <GenerateResultImage
            key={viewing.id}
            repoId={repo.id}
            commitId={viewing.id}
            version={selected + 1}
            enabled={previewAvailable()}
            auto={autogen === "1" && selected === head}
          />
        ) : (
          <div className="flex aspect-[4/3] max-h-80 w-full items-center justify-center rounded-tile border border-dashed border-frame text-sm text-secondary">
            이 버전에는 아직 결과 이미지가 없어요.
          </div>
        )}
      </div>

      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <div>
          <StyleTag style={repo.style} />
          <h1 className="mt-3 break-words text-[28px] font-bold leading-tight">{repo.description}</h1>
          <p className="label-mono mt-3 font-normal text-secondary">
            <Link href={`/u/${repo.owner}`} className="link-hover">
              @{repo.owner}
            </Link>{" "}
            · v{commits.length} · {repo.updatedAt.slice(0, 10)}
          </p>
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
        </div>

        <div className="flex flex-wrap gap-3">
          <LikeButton kind="repo" targetId={String(repo.id)} liked={!!like.liked} count={like.count} signedIn={!!user} />
          {isOwner ? (
            <>
              <VisibilityToggle repoId={repo.id} visibility={repo.visibility} />
              {!editing && (
                <Link href={`/repos/${repo.id}?edit=1`} className="btn-mint flex-1 py-2.5 text-center text-[13px]">
                  수정하기
                </Link>
              )}
            </>
          ) : (
            <div className="min-w-64 flex-1">
              <ForkButton repoId={repo.id} />
            </div>
          )}
        </div>

        <ModelCard model={repo.model} />

        {!editing && (
          <div className="space-y-3">
            {isOwner && (
              <div className="flex items-center justify-between gap-4">
                <p className="label-mono text-secondary">
                  v{selected + 1} · {viewing.hash}
                  {selected === head && <span className="ml-2 text-mint">HEAD</span>}
                </p>
                {base !== null ? (
                  <Link href={versionLink(selected + 1)} className="label-mono link-hover text-secondary">
                    프롬프트 보기
                  </Link>
                ) : (
                  selected > 0 && (
                    <Link href={versionLink(selected + 1, `&diff=${selected}`)} className="label-mono link-hover text-mint">
                      변경 사항 보기
                    </Link>
                  )
                )}
              </div>
            )}
            <PromptBlock label="Prompt" text={viewing.prompt} />
          </div>
        )}

        {sources.length > 0 && (
          <section>
            <h2 className="label-mono border-b border-frame pb-3 text-secondary">Source images · {sources.length}</h2>
            <ul className="mt-4 grid grid-cols-4 gap-3">
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

        {isOwner && (
          <section>
            <h2 className="label-mono border-b border-frame pb-3 text-secondary">History · {commits.length} commits</h2>
            <ol className="mt-4 space-y-3 border-l border-purple-rule pl-4">
              {commits
                .map((commit, i) => ({ commit, i }))
                .reverse()
                .map(({ commit, i }) => (
                  <li key={commit.id}>
                    <Link
                      href={versionLink(i + 1)}
                      className={`block rounded-tile border px-4 py-3 transition-colors duration-150 ${
                        i === selected && !editing ? "border-mint" : "border-frame hover:border-secondary"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="label-mono text-secondary">
                            v{i + 1} · {commit.hash} · {formatTime(commit.createdAt)}
                          </p>
                          <p className="mt-1.5 break-words text-[15px] font-bold">{commit.message}</p>
                        </div>
                        {commit.image && (
                          <Image
                            src={commit.image.src}
                            alt=""
                            width={44}
                            height={44}
                            className="size-11 shrink-0 rounded-img border border-frame object-cover"
                          />
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
            </ol>
          </section>
        )}
      </aside>
    </main>
  );
}
