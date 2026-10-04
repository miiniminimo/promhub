import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { RepoSummary } from "@/lib/server/repos";
import { StyleTag } from "./StyleTag";

/** One repo row (cover, owner / name, model · version); `trailing` holds row actions. */
export function RepoListItem({ repo, trailing }: { repo: RepoSummary; trailing?: ReactNode }) {
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
      {trailing}
    </li>
  );
}
