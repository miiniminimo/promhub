"use client";

import { startTransition, useActionState } from "react";
import { createRepoAction } from "@/app/actions";
import { STYLES } from "@/lib/styles";
import { PromptComposer } from "./PromptComposer";
import { ResultImageInput } from "./ResultImageInput";
import { SourceImagesInput } from "./SourceImagesInput";
import { fieldClass } from "./ui";

export function NewPromptForm() {
  const [state, action, pending] = useActionState(createRepoAction, undefined);

  return (
    <form
      // Submit manually instead of `action={...}` so React doesn't reset the fields when the
      // server returns a validation error (the chat-built prompt lives in state either way).
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
      className="space-y-6"
    >
      <label className="block">
        <span className="label-mono text-secondary">제목 *</span>
        <input name="title" required placeholder="예: 시네마틱 제품 사진 프롬프트" className={`${fieldClass} mt-2`} />
      </label>

      <div>
          <span id="style-label" className="label-mono block text-secondary">
            스타일 *
          </span>
          <div role="radiogroup" aria-labelledby="style-label" className="mt-2 flex gap-2">
            {STYLES.map((s, i) => (
              <label key={s.value} className="cursor-pointer">
                <input type="radio" name="style" value={s.value} defaultChecked={i === 0} className="peer sr-only" />
                <span className="label-mono flex h-10 items-center rounded-pill border border-frame px-4 text-secondary peer-checked:border-mint peer-checked:text-mint peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-focus">
                  {s.label}
                </span>
              </label>
            ))}
          </div>
      </div>

      <PromptComposer />

      <SourceImagesInput />

      <ResultImageInput />

      <fieldset>
        <legend className="label-mono text-secondary">공개 설정</legend>
        <div className="mt-2 flex gap-2">
          {[
            { value: "public", label: "공개 — 둘러보기 피드에 노출" },
            { value: "private", label: "비공개 — 나만 보기" },
          ].map((o) => (
            <label key={o.value} className="cursor-pointer">
              <input type="radio" name="visibility" value={o.value} defaultChecked={o.value === "public"} className="peer sr-only" />
              <span className="block rounded-pill border border-frame px-4 py-2 text-sm text-secondary peer-checked:border-mint peer-checked:text-mint">
                {o.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {state?.error && (
        <p className="rounded-tag border border-ultraviolet px-3 py-2 text-sm text-muted">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="btn-mint px-8 py-2.5 disabled:opacity-50">
        저장소 만들기
      </button>
    </form>
  );
}
