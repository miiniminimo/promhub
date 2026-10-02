"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export type TestFilterValues = { q: string; level: string; category: string; status: string; sort: string };

type Props = { values: TestFilterValues; categories: string[]; total: number; signedIn: boolean };

const selectClass =
  "h-10 rounded-tag border border-frame bg-canvas px-3 text-sm text-muted transition-colors duration-150 hover:border-secondary focus:border-mint focus:outline-none";

/** Search box, filter dropdowns and sort — all kept in the URL query. */
export function TestFilters({ values, categories, total, signedIn }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(values.q);

  function apply(patch: Partial<TestFilterValues>) {
    const next = { ...values, ...patch };
    const params = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]);
    router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ q: q.trim() });
        }}
        className="flex h-12 items-center rounded-tag border border-frame px-4 focus-within:border-mint"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="풀고 싶은 문제 제목, 분야 검색"
          className="flex-1 bg-transparent text-[15px] placeholder:text-secondary focus:outline-none"
        />
        <button type="submit" aria-label="검색" className="text-secondary hover:text-white">
          ⌕
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <select value={values.level} onChange={(e) => apply({ level: e.target.value })} className={selectClass} aria-label="난이도">
          <option value="">난이도</option>
          {[1, 2, 3].map((lv) => (
            <option key={lv} value={lv}>
              Lv. {lv}
            </option>
          ))}
        </select>
        <select
          value={values.category}
          onChange={(e) => apply({ category: e.target.value })}
          className={selectClass}
          aria-label="분야"
        >
          <option value="">분야</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {signedIn && (
          <select value={values.status} onChange={(e) => apply({ status: e.target.value })} className={selectClass} aria-label="상태">
            <option value="">상태</option>
            <option value="unsolved">풀지 않은 문제</option>
            <option value="solved">푼 문제</option>
            <option value="trying">푸는 중</option>
          </select>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-frame pb-3">
        <p className="text-[15px] font-bold">{total} 문제</p>
        <select value={values.sort} onChange={(e) => apply({ sort: e.target.value })} className={`${selectClass} h-8`} aria-label="정렬">
          <option value="">기본순</option>
          <option value="level">난이도순</option>
          <option value="solvers">완료한 사람 많은 순</option>
          <option value="rate">정답률 높은 순</option>
        </select>
      </div>
    </div>
  );
}
