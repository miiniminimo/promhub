import Link from "next/link";
import { CHALLENGES } from "@/lib/challenges";
import { getCurrentUser } from "@/lib/server/auth";
import { challengeStatuses } from "@/lib/server/submissions";

export default async function TestsPage() {
  const user = await getCurrentUser();
  const statuses = challengeStatuses(user?.id ?? null);
  const solved = CHALLENGES.filter((c) => statuses.get(c.slug)?.bestScore === 100).length;

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 py-12 lg:px-12">
      <p className="text-[19px] font-light uppercase tracking-[1.9px] text-secondary">Practice prompt engineering</p>
      <h1 className="mt-3 font-display text-[54px] uppercase leading-[0.95] tracking-[1.07px] sm:text-[90px]">
        Prompt Test
      </h1>
      <p className="mt-6 max-w-2xl text-muted">
        문제를 읽고 프롬프트를 작성하면 테스트 케이스로 자동 채점돼요.{" "}
        {user ? (
          <span className="text-mint">
            {solved} / {CHALLENGES.length} 해결
          </span>
        ) : (
          <Link href="/login?next=/tests" className="link-hover text-mint underline">
            로그인하면 풀이 기록이 저장돼요.
          </Link>
        )}
      </p>

      <div className="mt-10 overflow-x-auto rounded-tile border border-frame">
        <table className="w-full min-w-[640px] text-left">
          <thead className="label-mono border-b border-frame text-secondary">
            <tr>
              <th className="px-5 py-3 font-bold">상태</th>
              <th className="px-5 py-3 font-bold">제목</th>
              <th className="px-5 py-3 font-bold">난이도</th>
              <th className="px-5 py-3 font-bold">분류</th>
              <th className="px-5 py-3 text-right font-bold">최고 점수</th>
            </tr>
          </thead>
          <tbody>
            {CHALLENGES.map((c) => {
              const status = statuses.get(c.slug);
              const done = status?.bestScore === 100;
              return (
                <tr key={c.slug} className="border-b border-frame last:border-0">
                  <td className="px-5 py-4">
                    <span className={`label-mono ${done ? "text-mint" : status ? "text-tile-yellow" : "text-secondary"}`}>
                      {done ? "✓ 해결" : status ? "시도 중" : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <Link href={`/tests/${c.slug}`} className="link-hover font-bold">
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <span className="label-mono">Lv. {c.level}</span>
                  </td>
                  <td className="px-5 py-4 text-sm text-secondary">{c.category}</td>
                  <td className="px-5 py-4 text-right font-mono text-sm">{status ? `${status.bestScore}점` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
