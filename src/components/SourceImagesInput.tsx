"use client";

import { useState } from "react";
import { uploadSourceImageAction } from "@/app/actions";
import { fieldClass } from "./ui";

const MAX_SOURCES = 4;

type Source = { src: string; link: string | null };

/**
 * Source images (inputs / references) for a new prompt: upload a file or paste an image link.
 * Each entry is submitted as a `sources` value.
 */
export function SourceImagesInput() {
  const [sources, setSources] = useState<Source[]>([]);
  const [url, setUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = sources.length >= MAX_SOURCES;

  async function upload(files: FileList) {
    setError(null);
    const list = Array.from(files).slice(0, MAX_SOURCES - sources.length);
    setUploading(true);
    for (const file of list) {
      const data = new FormData();
      data.set("file", file);
      const res = await uploadSourceImageAction(data);
      if (!res.ok) {
        setError(res.error);
        continue;
      }
      setSources((prev) => [...prev, { src: res.src, link: null }]);
    }
    setUploading(false);
  }

  function addUrl() {
    const value = url.trim();
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
      setError("http(s) 로 시작하는 이미지 주소를 입력해주세요.");
      return;
    }
    setError(null);
    setSources((prev) => [...prev, { src: value, link: value }]);
    setUrl("");
  }

  return (
    <div>
      <span className="label-mono text-secondary">소스 이미지 (선택, 최대 {MAX_SOURCES}개)</span>
      <p className="mt-1 text-sm text-secondary">생성에 사용한 입력·참고 이미지를 파일로 올리거나 링크로 걸어두세요.</p>

      {sources.map((s) => (
        <input key={s.src} type="hidden" name="sources" value={s.src} />
      ))}

      {sources.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3">
          {sources.map((s, i) => (
            <li key={s.src} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary external hosts */}
              <img
                src={s.src}
                alt={`소스 이미지 ${i + 1}`}
                referrerPolicy="no-referrer"
                className="size-24 rounded-img border border-frame object-cover"
              />
              <span className="label-mono absolute bottom-1 left-1 rounded-[20px] bg-canvas px-1.5 py-0.5 text-[10px]">
                {s.link ? "Link" : "File"}
              </span>
              <button
                type="button"
                onClick={() => setSources((prev) => prev.filter((x) => x !== s))}
                aria-label={`소스 이미지 ${i + 1} 제거`}
                className="absolute -right-2 -top-2 size-6 rounded-full bg-slate text-xs text-muted hover:bg-white hover:text-black"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label
          className={`label-mono cursor-pointer rounded-pill bg-slate px-4 py-2 text-muted ${
            full || uploading ? "pointer-events-none opacity-40" : "hover:bg-white/20"
          }`}
        >
          {uploading ? "업로드 중…" : "파일 올리기"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            className="sr-only"
            disabled={full || uploading}
            onChange={(e) => {
              if (e.target.files?.length) upload(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-sm text-secondary">또는</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (url.trim()) addUrl();
            }
          }}
          disabled={full}
          placeholder="https://… 이미지 링크"
          className={`${fieldClass} min-w-0 flex-1 disabled:opacity-40`}
        />
        <button
          type="button"
          onClick={addUrl}
          disabled={full || !url.trim()}
          className="label-mono rounded-pill border border-mint px-4 py-2 text-mint disabled:opacity-40"
        >
          링크 추가
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-tile-pink">{error}</p>}
    </div>
  );
}
