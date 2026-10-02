import type { ReactNode } from "react";

// Thin capitalised eyebrow + Manuka-style display title (DESIGN.md "whisper vs shout").
const TITLE = {
  hero: "mt-4 text-[54px] sm:text-[90px] lg:text-[107px]",
  page: "mt-3 text-[54px] sm:text-[90px]",
  form: "mb-10 mt-3 text-[60px]",
} as const;

type Props = { eyebrow: string; title: ReactNode; size?: keyof typeof TITLE; className?: string };

export function PageHeading({ eyebrow, title, size = "page", className = "" }: Props) {
  return (
    <>
      <p className="text-[19px] font-light uppercase leading-[1.2] tracking-[1.9px] text-secondary">{eyebrow}</p>
      <h1 className={`font-display uppercase leading-[0.95] tracking-[1.07px] ${TITLE[size]} ${className}`}>{title}</h1>
    </>
  );
}
