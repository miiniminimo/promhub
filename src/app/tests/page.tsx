import Link from "next/link";
import { type TestFilterValues, TestFilters } from "@/components/TestFilters";
import { CATEGORIES, CHALLENGES } from "@/lib/challenges";
import { getCurrentUser } from "@/lib/server/auth";
import { challengeStats, challengeStatuses, testSummary } from "@/lib/server/submissions";
import { PageHeading } from "@/components/PageHeading";

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function TestsPage(props: PageProps<"/tests">) {
  const sp = await props.searchParams;
  const values: TestFilterValues = {
    q: str(sp.q),
    level: str(sp.level),
    category: str(sp.category),
    status: str(sp.status),
    sort: str(sp.sort),
  };
  const user = await getCurrentUser();
  const statuses = challengeStatuses(user?.id ?? null);
  const stats = challengeStats();
  const summary = user ? testSummary(user.id) : null;

  const rows = CHALLENGES.map((c, order) => {
    const s = stats.get(c.slug);
    const status = statuses.get(c.slug);
    return {
      ...c,
      order,
      solvers: s?.solvers ?? 0,
      rate: s?.submissions ? Math.round((s.correct / s.submissions) * 100) : null,
      state: status?.bestScore === 100 ? "solved" : status ? "trying" : "unsolved",
    };
  })
    .filter((c) => !values.q || `${c.title} ${c.category}`.toLowerCase().includes(values.q.toLowerCase()))
    .filter((c) => !values.level || String(c.level) === values.level)
    .filter((c) => !values.category || c.category === values.category)
    .filter((c) => !values.status || c.state === values.status)
    .sort((a, b) => {
      if (values.sort === "level") return a.level - b.level || a.order - b.order;
      if (values.sort === "solvers") return b.solvers - a.solvers || a.order - b.order;
      if (values.sort === "rate") return (b.rate ?? -1) - (a.rate ?? -1) || a.order - b.order;
      return a.order - b.order;
    });

  return (
    <main className="mx-auto w-full max-w-[1300px] px-6 py-12 lg:px-12">
      <PageHeading eyebrow="Practice prompt engineering" title="Prompt Test" />

      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section>
          <TestFilters values={values} categories={CATEGORIES} total={rows.length} signedIn={!!user} />

          <table className="mt-2 w-full text-left">
            <thead className="label-mono border-b border-frame text-secondary">
              <tr>
                <th className="w-16 py-3 pr-2 font-bold">상태</th>
                <th className="py-3 pr-2 font-bold">제목</th>
                <th className="w-20 py-3 pr-2 font-bold">난이도</th>
                <th className="hidden w-28 py-3 pr-2 text-right font-bold sm:table-cell">완료한 사람</th>
                <th className="w-20 py-3 text-right font-bold">정답률</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.slug} className="border-b border-frame">
                  <td className="py-4 pr-2">
                    {c.state === "solved" ? (
                      <span className="label-mono text-mint" title="해결">
                        ✓
                      </span>
                    ) : c.state === "trying" ? (
                      <span className="label-mono text-tile-yellow" title="푸는 중">
                        ●
                      </span>
                    ) : null}
                  </td>
                  <td className="py-4 pr-2">
                    <Link href={`/tests/${c.slug}`} className="link-hover text-[15px] font-bold">
                      {c.title}
                    </Link>
                    <p className="mt-1 text-xs text-secondary">{c.category}</p>
                  </td>
                  <td className="py-4 pr-2">
                    <span className={`label-mono ${c.level === 1 ? "text-mint" : c.level === 2 ? "text-tile-yellow" : "text-tile-pink"}`}>
                      Lv. {c.level}
                    </span>
                  </td>
                  <td className="hidden py-4 pr-2 text-right font-mono text-sm text-muted sm:table-cell">
                    {c.solvers.toLocaleString()}명
                  </td>
                  <td className="py-4 text-right font-mono text-sm text-muted">{c.rate == null ? "—" : `${c.rate}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && <p className="py-16 text-center text-secondary">조건에 맞는 문제가 없어요.</p>}
        </section>

        <aside className="space-y-4">
          {summary && user ? (
            <div className="rounded-tile border border-frame p-5">
              <p className="label-mono text-secondary">@{user.username}</p>
              <p className="mt-2 text-[24px] font-bold leading-tight">
                {summary.solved} / {summary.total} 해결
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate">
                <div className="h-full bg-mint" style={{ width: `${(summary.solved / summary.total) * 100}%` }} />
              </div>
              {summary.next && (
                <Link href={`/tests/${summary.next.slug}`} className="group mt-4 block rounded-img bg-slate p-3">
                  <span className="label-mono text-secondary">다음 추천 문제</span>
                  <span className="mt-1 block text-sm font-bold transition-colors duration-150 group-hover:text-link-hover">
                    Lv.{summary.next.level} {summary.next.title}
                  </span>
                </Link>
              )}
            </div>
          ) : (
            <div className="rounded-tile border border-frame p-5">
              <p className="text-[15px] font-bold leading-snug">로그인하고 프롬프트 테스트를 시작하세요!</p>
              <p className="mt-2 text-sm text-secondary">푼 문제와 점수가 기록돼요.</p>
              <Link href="/login?next=/tests" className="btn-mint mt-4 block text-center">
                로그인
              </Link>
            </div>
          )}
          <Link href="/me" className="group block rounded-feature bg-ultraviolet p-5">
            <p className="text-[15px] font-bold leading-snug">프롬프트 테스트 풀이 기록을 확인해보세요!</p>
            <p className="label-mono mt-3 text-white/80 transition-colors duration-150 group-hover:text-white">확인하기 →</p>
          </Link>
        </aside>
      </div>
    </main>
  );
}
