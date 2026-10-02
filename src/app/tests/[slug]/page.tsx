import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { ChallengeWorkspace } from "@/components/ChallengeWorkspace";
import { CHALLENGES, getChallenge } from "@/lib/challenges";
import { getCurrentUser } from "@/lib/server/auth";
import { lastSubmission } from "@/lib/server/submissions";

export default async function ChallengePage(props: PageProps<"/tests/[slug]">) {
  const { slug } = await props.params;
  const challenge = getChallenge(slug);
  if (!challenge) notFound();
  const user = await getCurrentUser();
  const last = user ? lastSubmission(user.id, slug) : undefined;
  const index = CHALLENGES.indexOf(challenge);
  const next = CHALLENGES[index + 1] ?? null;

  return (
    <ChallengeWorkspace
      slug={challenge.slug}
      title={challenge.title}
      category={challenge.category}
      level={challenge.level}
      initialPrompt={last?.prompt ?? ""}
      signedIn={!!user}
      next={next && { slug: next.slug, title: next.title }}
      description={
        <>
          <h2 className="label-mono text-secondary">문제 설명</h2>
          <article className="challenge-md mt-2">
            <Markdown>{challenge.description}</Markdown>
          </article>
          <h2 className="label-mono mt-10 text-secondary">테스트 케이스 · {challenge.tests.length}개</h2>
          <ol className="mt-3 space-y-1.5 text-sm text-muted">
            {challenge.tests.map((t, i) => (
              <li key={t.label}>
                <span className="font-mono text-secondary">#{i + 1}</span> {t.label}
              </li>
            ))}
          </ol>
        </>
      }
    />
  );
}
