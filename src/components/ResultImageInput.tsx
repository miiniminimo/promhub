"use client";

import { useState } from "react";

type Props = { label?: string; onChange?: (hasImage: boolean) => void };

/** Optional result-image upload (`image` + measured `imageWidth`/`imageHeight`) with a local preview. */
export function ResultImageInput({ label = "결과 이미지 (선택, 5MB 이하)", onChange }: Props) {
  const [preview, setPreview] = useState<{ url: string; width: number; height: number } | null>(null);

  function onImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    onChange?.(!!file);
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => setPreview({ url, width: img.naturalWidth, height: img.naturalHeight });
    img.src = url;
  }

  return (
    <div>
      <span className="label-mono text-secondary">{label}</span>
      <input
        name="image"
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
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
  );
}
