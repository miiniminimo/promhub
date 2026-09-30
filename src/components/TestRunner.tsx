"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { runTestAction, type TestRunResult } from "@/app/actions";

type Props = { slug: string; initialPrompt: string; signedIn: boolean };

export function TestRunner({ slug, initialPrompt, signedIn }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [result, setResult] = useState<(TestRunResult & { mode: "run" | "submit" }) | null>(null);
  const [pending, startTransition] = useTransition();

  function run(submit: boolean) {
    startTransition(async () => {
      const res = await runTestAction(slug, prompt, submit);
      setResult({ ...res, mode: submit ? "submit" : "run" });
    });
  }

  const passed = result?.results.filter((r) => r.passed).length ?? 0;

  return (
    <section className="flex min-h-[80vh] flex-col lg:min-h-0">
      <div className="flex items-center justify-between border-b border-frame px-6 py-3">
        <span className="label-mono text-secondary">Prompt · {prompt.length}자</span>
        <button onClick={() => setPrompt("")} className="label-mono link-hover text-secondary">
          초기화
        </button>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        spellCheck={false}
        placeholder="여기에 프롬프트를 작성하세요…"
        className="min-h-64 flex-1 resize-none bg-[#0d0d0d] px-6 py-4 font-mono text-[13px] leading-relaxed text-muted placeholder:text-secondary focus:outline-none"
      />

      <div className="h-72 overflow-y-auto border-t border-frame px-6 py-4">
        <p className="label-mono text-secondary">실행 결과</p>
        {pending && <p className="mt-3 font-mono text-sm text-secondary">채점 중…</p>}
        {!pending && !result && (
          <p className="mt-3 font-mono text-sm text-secondary">실행 결과가 여기에 표시됩니다.</p>
        )}
        {!pending && result && (
          <div className="mt-3 space-y-1.5 font-mono text-[13px]">
            {result.results.map((r, i) => (
              <p key={r.label}>
                <span className="text-secondary">테스트 {i + 1} 〉</span>{" "}
                <span className={r.passed ? "text-mint" : "text-tile-pink"}>{r.passed ? "통과" : "실패"}</span>{" "}
                <span className="text-muted">{r.label}</span> <span className="text-secondary">({r.detail})</span>
              </p>
            ))}
            <p className="pt-3 text-[15px] font-bold">
              {result.results.length}개 중 {passed}개 통과 ·{" "}
              <span className={result.score === 100 ? "text-mint" : "text-tile-yellow"}>{result.score}점</span>
            </p>
            {result.mode === "submit" &&
              (result.submitted ? (
                <p className="text-secondary">제출 완료 — 기록이 저장되었습니다.</p>
              ) : (
                <p className="text-secondary">
                  <Link href={`/login?next=/tests/${slug}`} className="link-hover text-mint underline">
                    로그인
                  </Link>
                  하면 제출 기록이 저장돼요.
                </p>
              ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-frame px-6 py-3">
        <button
          onClick={() => run(false)}
          disabled={pending || !prompt.trim()}
          className="label-mono rounded-[24px] bg-slate px-5 py-2 leading-[2] text-muted disabled:opacity-40"
        >
          테스트 실행
        </button>
        <button onClick={() => run(true)} disabled={pending || !prompt.trim()} className="btn-mint disabled:opacity-40">
          {signedIn ? "제출 후 채점하기" : "채점하기"}
        </button>
      </div>
    </section>
  );
}
