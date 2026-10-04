import Link from "next/link";
import { toggleFollowAction } from "@/app/actions";

export function FollowButton({ username, following, signedIn }: { username: string; following: boolean; signedIn: boolean }) {
  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(`/u/${username}`)}`} className="btn-mint">
        Follow
      </Link>
    );
  }
  return (
    <form action={toggleFollowAction.bind(null, username)}>
      <button type="submit" aria-pressed={following} className={following ? "btn-slate" : "btn-mint"}>
        {following ? "Following" : "Follow"}
      </button>
    </form>
  );
}
