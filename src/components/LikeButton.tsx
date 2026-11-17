import Link from "next/link";
import { toggleLikeAction } from "@/app/actions";
import type { LikeKind } from "@/lib/server/social";
import { ACTION_HEIGHT } from "./ui";

type Props = {
  kind: LikeKind;
  targetId: string;
  liked: boolean;
  count: number;
  signedIn: boolean;
  /** "action": the taller size used in the post/repo action row. */
  size?: "list" | "action";
};

/** ♥ save toggle; signed-out visitors are sent to log in first. */
export function LikeButton({ kind, targetId, liked, count, signedIn, size = "list" }: Props) {
  const className = `label-mono flex ${size === "action" ? ACTION_HEIGHT : "h-10"} items-center gap-2 rounded-pill border px-4 transition-colors duration-150 ${
    liked ? "border-tile-pink bg-tile-pink text-black" : "border-frame text-muted hover:border-tile-pink hover:text-tile-pink"
  }`;
  const label = (
    <>
      <span aria-hidden>{liked ? "♥" : "♡"}</span>
      {liked ? "저장됨" : "좋아요"} · {count}
    </>
  );
  if (!signedIn) {
    const path = kind === "post" ? `/p/${targetId}` : `/repos/${targetId}`;
    return (
      <Link href={`/login?next=${encodeURIComponent(path)}`} className={className}>
        {label}
      </Link>
    );
  }
  return (
    <form action={toggleLikeAction.bind(null, kind, targetId)}>
      <button type="submit" aria-pressed={liked} className={className}>
        {label}
      </button>
    </form>
  );
}
