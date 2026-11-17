import Link from "next/link";
import type { UserRef } from "@/lib/server/social";
import { Modal } from "./Modal";
import { UserList } from "./UserList";

export type FollowsView = "followers" | "following";

export const followsView = (value: unknown): FollowsView | null =>
  value === "followers" || value === "following" ? value : null;

type Props = {
  username: string;
  counts: { followers: number; following: number };
  /** Which list is open (from `?follows=`), and its users. */
  open: FollowsView | null;
  users: (UserRef & { since: string })[];
  /** Builds this page's URL with `follows` set (null = modal closed). */
  href: (follows: FollowsView | null) => string;
  self: boolean;
};

const EMPTY = {
  followers: { self: "아직 나를 팔로우하는 사람이 없어요.", other: "아직 팔로워가 없어요." },
  following: { self: "아직 팔로우하는 사람이 없어요.", other: "아직 팔로우하는 사람이 없어요." },
};

/** "팔로워 N · 팔로잉 N" under a profile name; each count opens its list in a modal. */
export function FollowStats({ username, counts, open, users, href, self }: Props) {
  return (
    <>
      <Link href={href("followers")} scroll={false} className="link-hover">
        팔로워 <span className="text-white">{counts.followers}</span>
      </Link>{" "}
      ·{" "}
      <Link href={href("following")} scroll={false} className="link-hover">
        팔로잉 <span className="text-white">{counts.following}</span>
      </Link>
      {open && (
        <Modal title={`@${username} · ${open === "followers" ? "팔로워" : "팔로잉"} ${counts[open]}`} closeHref={href(null)}>
          <UserList users={users} empty={EMPTY[open][self ? "self" : "other"]} compact />
        </Modal>
      )}
    </>
  );
}
