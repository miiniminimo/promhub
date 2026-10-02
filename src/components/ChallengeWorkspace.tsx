"use client";

import Link from "next/link";
import { type ReactNode, useRef, useState, useTransition } from "react";
import { runTestAction, type TestRunResult } from "@/app/actions";
import { PromptEditor } from "./PromptEditor";

type Props = {
  slug: string;
  title: string;
  category: string;
  level: number;
  /** Server-rendered problem statement. */
  description: ReactNode;
  initialPrompt: string;
  signedIn: boolean;
  next: { slug: string; title: string } | null;
};

type Run = TestRunResult & { mode: "run" | "submit" };

/** Drag handle that reports the pointer position as a percentage of the container. */
function useSplit(initial: number, axis: "x" | "y", min = 20, max = 80) {
  const [pct, setPct] = useState(initial);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleProps = {
    onPointerDown: (e: React.PointerEvent) => e.currentTarget.setPointerCapture(e.pointerId),
    onPointerMove: (e: React.PointerEvent) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId) || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const raw = axis === "x" ? ((e.clientX - rect.left) / rect.width) * 100 : ((e.clientY - rect.top) / rect.height) * 100;
      setPct(Math.min(max, Math.max(min, raw)));
    },
  };
  return { pct, containerRef, handleProps };
}

export function ChallengeWorkspace({ slug, title, category, level, description, initialPrompt, signedIn, next }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [run, setRun] = useState<Run | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [pending, startTransition] = useTransition();
  const { pct: leftPct, containerRef: colsRef, handleProps: colHandle } = useSplit(42, "x", 25, 70);
  const { pct: topPct, containerRef: rowsRef, handleProps: rowHandle } = useSplit(60, "y", 25, 80);

  function execute(submit: boolean) {
    startTransition(async () => {
      const res = await runTestAction(slug, prompt, submit);
      setRun({ ...res, mode: submit ? "submit" : "run" });
      if (submit && res.score === 100) setShowPass(true);
    });
  }

  const passed = run?.results.filter((r) => r.passed).length ?? 0;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-frame px-5 text-sm">
        <Link href="/tests" className="link-hover text-secondary">
          Prompt Test
        </Link>
        <span className="text-secondary">›</span>
        <Link href={`/tests?category=${encodeURIComponent(category)}`} className="link-hover text-secondary">
          {category}
        </Link>
        <span className="text-secondary">›</span>
        <span className="truncate font-bold">{title}</span>
        <span className="label-mono ml-auto rounded-[20px] bg-slate px-2.5 py-1">Lv. {level}</span>
      </div>

      {/* Panes */}
      <div
        ref={colsRef}
        style={{ "--left": `${leftPct}%` } as React.CSSProperties}
        className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[var(--left)_6px_minmax(0,1fr)]"
      >
        <section className="overflow-y-auto px-6 py-6 lg:px-8">{description}</section>

        <div
          {...colHandle}
          role="separator"
          aria-orientation="vertical"
          className="hidden cursor-col-resize bg-frame transition-colors duration-150 hover:bg-mint lg:block"
        />

        <div
          ref={rowsRef}
          style={{ "--top": `${topPct}%` } as React.CSSProperties}
          className="flex min-h-0 flex-col border-t border-frame lg:grid lg:grid-rows-[var(--top)_6px_minmax(0,1fr)] lg:border-t-0"
        >
          <div className="flex min-h-[50vh] flex-col lg:min-h-0">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-frame px-4">
              <span className="label-mono text-secondary">prompt.txt</span>
              <span className="label-mono text-secondary">{prompt.length}자</span>
            </div>
            <div className="min-h-0 flex-1">
              <PromptEditor value={prompt} onChange={setPrompt} placeholder="여기에 프롬프트를 작성하세요…" />
            </div>
          </div>

          <div
            {...rowHandle}
            role="separator"
            aria-orientation="horizontal"
            className="hidden cursor-row-resize bg-frame transition-colors duration-150 hover:bg-mint lg:block"
          />

          <div className="flex min-h-64 flex-col lg:min-h-0">
            <div className="flex h-10 shrink-0 items-center border-b border-frame px-4">
              <span className="label-mono text-secondary">실행 결과</span>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[13px] leading-[22px]">
              {pending && <p className="text-secondary">{run?.mode === "submit" ? "채점 중입니다…" : "실행 중입니다…"}</p>}
              {!pending && !run && <p className="text-secondary">실행 결과가 여기에 표시됩니다.</p>}
              {!pending && run && (
                <div>
                  {run.mode === "submit" ? (
                    <>
                      <p className="text-muted">채점을 시작합니다.</p>
                      <p className="mt-2 font-bold">정확성 테스트</p>
                    </>
                  ) : (
                    <p className="font-bold">테스트 실행 결과</p>
                  )}
                  {run.results.map((r, i) => (
                    <p key={r.label} className="whitespace-pre-wrap">
                      <span className="text-secondary">테스트 {i + 1} 〉</span>{" "}
                      <span className={r.passed ? "text-mint" : "text-tile-pink"}>{r.passed ? "통과" : "실패"}</span>{" "}
                      <span className="text-muted">{r.label}</span> <span className="text-secondary">({r.detail})</span>
                    </p>
                  ))}
                  {run.mode === "submit" ? (
                    <div className="mt-3">
                      <p className="font-bold">채점 결과</p>
                      <p className="text-muted">정확성: {run.score.toFixed(1)}</p>
                      <p className="text-muted">
                        합계: <span className={run.score === 100 ? "text-mint" : "text-tile-yellow"}>{run.score.toFixed(1)}</span> / 100.0
                      </p>
                      {!run.submitted && (
                        <p className="mt-2 text-secondary">
                          <Link href={`/login?next=/tests/${slug}`} className="link-hover text-mint underline">
                            로그인
                          </Link>
                          하면 제출 기록이 저장돼요.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-3 text-muted">
                      {run.results.length}개 중 {passed}개 통과
                      {passed < run.results.length && " · 실패한 테스트를 확인해 보세요."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-t border-frame px-5">
        <Link href="/tests" className="label-mono rounded-[24px] bg-slate px-4 py-2 leading-[2] text-muted">
          문제 목록
        </Link>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => {
              setPrompt("");
              setRun(null);
            }}
            className="label-mono rounded-[24px] bg-slate px-4 py-2 leading-[2] text-muted"
          >
            초기화
          </button>
          <button
            onClick={() => execute(false)}
            disabled={pending || !prompt.trim()}
            className="label-mono rounded-[24px] bg-slate px-4 py-2 leading-[2] text-muted disabled:opacity-40"
          >
            테스트 실행
          </button>
          <button onClick={() => execute(true)} disabled={pending || !prompt.trim()} className="btn-mint disabled:opacity-40">
            {signedIn ? "제출 후 채점하기" : "채점하기"}
          </button>
        </div>
      </div>

      {showPass && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 px-6" onClick={() => setShowPass(false)}>
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-feature border border-mint bg-canvas p-8 text-center"
          >
            <p className="font-display text-[60px] uppercase leading-[0.95] text-mint">Pass</p>
            <p className="mt-3 text-[20px] font-bold">정답입니다!</p>
            <p className="mt-2 text-sm text-secondary">모든 테스트를 통과했어요.{run?.submitted && " 기록이 저장되었습니다."}</p>
            <div className="mt-6 flex justify-center gap-2">
              <button
                onClick={() => setShowPass(false)}
                className="label-mono rounded-[24px] bg-slate px-5 py-2 leading-[2] text-muted"
              >
                닫기
              </button>
              {next && (
                <Link href={`/tests/${next.slug}`} className="btn-mint">
                  다음 문제
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
