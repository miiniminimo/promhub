import Link from "next/link";
import type { UserRef } from "@/lib/server/social";

export function UserList({ users, empty }: { users: (UserRef & { since: string })[]; empty: string }) {
  if (users.length === 0) {
    return <p className="mt-8 rounded-tile border border-frame px-6 py-12 text-center text-muted">{empty}</p>;
  }
  return (
    <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {users.map((u) => (
        <li key={u.id}>
          <Link href={`/u/${u.username}`} className="group flex items-center gap-3 rounded-tile border border-frame p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate font-display text-lg uppercase">
              {u.username[0]}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-mono text-[15px] font-bold transition-colors duration-150 group-hover:text-link-hover">
                @{u.username}
              </span>
              <span className="label-mono font-normal text-secondary">{u.since.slice(0, 10)} 부터</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
