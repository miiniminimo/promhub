"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { generateVersionImageAction } from "@/app/actions";

type Props = { repoId: number; commitId: number; version: number; enabled: boolean; auto: boolean };

/**
 * Placeholder for a version without a result image (owner only): renders one with the image
 * model on click, or straight away after saving (`auto`).
 */
export function GenerateResultImage({ repoId, commitId, version, enabled, auto }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  function generate() {
    if (started.current) return;
    started.current = true;
    setError(null);
    startTransition(async () => {
      const res = await generateVersionImageAction(repoId, commitId);
      if (!res.ok) {
        started.current = false;
        setError(res.error);
        return;
      }
      // Drop ?autogen so a reload doesn't try again, and pick up the new image.
      router.replace(`/repos/${repoId}?v=${version}`, { scroll: false });
      router.refresh();
    });
  }

  useEffect(() => {
    if (auto && enabled) generate();
    // Runs once on mount; `generate` guards against the dev-mode double effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex aspect-[4/3] max-h-80 w-full flex-col items-center justify-center gap-3 rounded-img border border-dashed border-frame px-6 text-center">
      {pending ? (
        <p className="label-mono text-secondary">v{version} 프롬프트로 결과 이미지를 그리는 중… (10~30초)</p>
      ) : (
        <>
          <p className="text-sm text-secondary">
            {enabled ? "아직 결과 이미지가 없어요." : "결과 이미지를 만들려면 OpenAI API 키가 필요해요."}
          </p>
          <button type="button" onClick={generate} disabled={!enabled} className="btn-mint disabled:opacity-40">
            이 버전으로 결과 이미지 만들기
          </button>
        </>
      )}
      {error && <p className="text-sm text-tile-pink">{error}</p>}
    </div>
  );
}
