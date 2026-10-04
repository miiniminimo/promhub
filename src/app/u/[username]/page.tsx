import Link from "next/link";
import { notFound } from "next/navigation";
import { FollowButton } from "@/components/FollowButton";
import { PageHeading } from "@/components/PageHeading";
import { RepoListItem } from "@/components/RepoListItem";
import { getCurrentUser } from "@/lib/server/auth";
import { listPublicRepos } from "@/lib/server/repos";
import { followCounts, getUserByUsername, isFollowing } from "@/lib/server/social";

export default async function ProfilePage(props: PageProps<"/u/[username]">) {
  const { username } = await props.params;
  const profile = getUserByUsername(decodeURIComponent(username));
  if (!profile) notFound();

  const viewer = await getCurrentUser();
  const isSelf = viewer?.id === profile.id;
  const counts = followCounts(profile.id);
  const repos = listPublicRepos(profile.id);

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 py-12 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <PageHeading eyebrow="Profile" title={`@${profile.username}`} className="break-all" />
          <p className="label-mono mt-4 text-secondary">
            팔로워 <span className="text-white">{counts.followers}</span> · 팔로잉{" "}
            <span className="text-white">{counts.following}</span>
          </p>
        </div>
        {isSelf ? (
          <Link href="/me" className="btn-slate">
            My Page
          </Link>
        ) : (
          <FollowButton
            username={profile.username}
            following={!!viewer && isFollowing(viewer.id, profile.id)}
            signedIn={!!viewer}
          />
        )}
      </div>

      <h2 className="label-mono mt-12 border-b border-frame pb-3 text-secondary">공개 프롬프트 · {repos.length}</h2>
      {repos.length === 0 ? (
        <p className="mt-8 rounded-tile border border-frame px-6 py-12 text-center text-muted">아직 공개한 프롬프트가 없어요.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {repos.map((repo) => (
            <RepoListItem key={repo.id} repo={repo} />
          ))}
        </ul>
      )}
    </main>
  );
}
