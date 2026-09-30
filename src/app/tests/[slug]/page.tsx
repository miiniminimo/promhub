import Link from "next/link";
import { notFound } from "next/navigation";
import Markdown from "react-markdown";
import { TestRunner } from "@/components/TestRunner";
import { getChallenge } from "@/lib/challenges";
import { getCurrentUser } from "@/lib/server/auth";
import { lastSubmission } from "@/lib/server/submissions";

export default async function ChallengePage(props: PageProps<"/tests/[slug]">) {
  const { slug } = await props.params;
  const challenge = getChallenge(slug);
  if (!challenge) notFound();
  const user = await getCurrentUser();
  const last = user ? lastSubmission(user.id, slug) : undefined;

  return (
    <main className="grid flex-1 lg:h-[calc(100vh-4rem)] lg:grid-cols-2">
      <section className="overflow-y-auto border-frame px-6 py-8 lg:border-r lg:px-10">
        <Link href="/tests" className="label-mono link-hover text-secondary">
          ← Prompt Test
        </Link>
        <div className="mt-4 flex items-center gap-3">
          <span className="label-mono rounded-[20px] bg-mint px-2.5 py-1 text-black">Lv. {challenge.level}</span>
          <span className="label-mono text-secondary">{challenge.category}</span>
        </div>
        <h1 className="mt-3 text-[34px] font-bold leading-none">{challenge.title}</h1>
        <article className="challenge-md mt-8">
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
      </section>
      <TestRunner slug={challenge.slug} initialPrompt={last?.prompt ?? ""} signedIn={!!user} />
    </main>
  );
}
