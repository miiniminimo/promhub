"use client";

import Form from "next/form";
import { usePathname, useSearchParams } from "next/navigation";

const inputClass =
  "w-60 rounded-tag border border-secondary bg-canvas px-3 py-1.5 text-[15px] placeholder:text-secondary transition-colors duration-150 focus:border-mint focus:outline-none";

/** Searches the explore feed (`/?q=`); keeps the current query in the box while on the feed. */
export function HeaderSearch() {
  const pathname = usePathname();
  const query = useSearchParams().get("q") ?? "";
  const value = pathname === "/" ? query : "";

  return (
    <Form action="/" role="search" className="ml-auto hidden lg:block">
      {/* key resets the uncontrolled input when the URL query changes (e.g. "지우기"). */}
      <input key={value} type="search" name="q" defaultValue={value} placeholder="Search prompts" aria-label="프롬프트 검색" maxLength={100} className={inputClass} />
    </Form>
  );
}

/** Same box without URL access, shown until the client component hydrates. */
export function HeaderSearchFallback() {
  return (
    <form action="/" role="search" className="ml-auto hidden lg:block">
      <input type="search" name="q" placeholder="Search prompts" aria-label="프롬프트 검색" maxLength={100} className={inputClass} />
    </form>
  );
}
