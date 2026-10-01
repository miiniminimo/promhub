"use client";

import { useActionState, useState } from "react";
import { createRepoAction } from "@/app/actions";
import { STYLES } from "@/lib/styles";
import { PromptComposer } from "./PromptComposer";
import { SourceImagesInput } from "./SourceImagesInput";
import { fieldClass } from "./ui";

const MODEL_SUGGESTIONS = ["Flux.1 D", "SDXL 1.0", "Pony", "Illustrious", "Krea 2", "OpenAI", "Imagen4", "Claude Opus 5.5", "GPT-5"];

export function NewPromptForm() {
  const [state, action, pending] = useActionState(createRepoAction, undefined);
  const [preview, setPreview] = useState<{ url: string; width: number; height: number } | null>(null);

  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => setPreview({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
  }

  return (
    <form action={action} className="space-y-6">
      <label className="block">
        <span className="label-mono text-secondary">제목 *</span>
        <input name="title" required placeholder="예: 시네마틱 제품 사진 프롬프트" className={`${fieldClass} mt-2`} />
      </label>

      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block">
          <span className="label-mono text-secondary">사용 모델 *</span>
          <input name="model" required list="models" placeholder="예: Flux.1 D" className={`${fieldClass} mt-2`} />
          <datalist id="models">
            {MODEL_SUGGESTIONS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
        <fieldset>
          <legend className="label-mono text-secondary">스타일 *</legend>
          <div className="mt-2 flex gap-2">
            {STYLES.map((s, i) => (
              <label key={s.value} className="cursor-pointer">
                <input type="radio" name="style" value={s.value} defaultChecked={i === 0} className="peer sr-only" />
                <span className="label-mono block rounded-pill border border-frame px-4 py-2 text-secondary peer-checked:border-mint peer-checked:text-mint">
                  {s.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <PromptComposer />

      <SourceImagesInput />

      <div>
        <span className="label-mono text-secondary">결과 이미지 (선택, 5MB 이하)</span>
        <input
          name="image"
          type="file"
          accept="image/*"
          onChange={onImage}
          className="mt-2 block w-full text-sm text-secondary file:mr-4 file:rounded-pill file:border-0 file:bg-slate file:px-4 file:py-2 file:font-mono file:text-xs file:uppercase file:text-muted"
        />
        <input type="hidden" name="imageWidth" value={preview?.width ?? ""} />
        <input type="hidden" name="imageHeight" value={preview?.height ?? ""} />
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img src={preview.url} alt="" className="mt-3 max-h-64 rounded-img border border-frame" />
        )}
      </div>

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
