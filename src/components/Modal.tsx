"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";

/**
 * URL-driven modal: the page renders it when a search param is set, and closing it (✕, Esc,
 * backdrop) navigates to `closeHref`. Without JS the ✕ link still closes it.
 */
export function Modal({ title, closeHref, children }: { title: string; closeHref: string; children: ReactNode }) {
  const router = useRouter();
  const closeRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const close = (e: KeyboardEvent) => e.key === "Escape" && router.replace(closeHref, { scroll: false });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", close);
    };
  }, [router, closeHref]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/70 p-4"
      onClick={(e) => e.target === e.currentTarget && router.replace(closeHref, { scroll: false })}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="flex max-h-[80vh] w-full max-w-md flex-col rounded-tile border border-frame bg-canvas"
      >
        <div className="flex items-center justify-between border-b border-frame px-5 py-3.5">
          <h2 id="modal-title" className="label-mono text-secondary">
            {title}
          </h2>
          <Link ref={closeRef} href={closeHref} replace scroll={false} aria-label="닫기" className="link-hover text-secondary">
            ✕
          </Link>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
