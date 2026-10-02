import Link from "next/link";
import { getCurrentUser } from "@/lib/server/auth";

// The logo links to the explore feed, so it has no separate nav item.
const NAV = [{ href: "/tests", label: "Prompt Test" }];

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-20 border-b border-frame bg-canvas">
      <div className="mx-auto flex h-16 max-w-[1300px] items-center gap-3 px-4 sm:gap-8 sm:px-6 lg:px-12">
        <Link href="/" className="shrink-0 font-display text-2xl uppercase leading-none tracking-[1px] sm:text-3xl">
          PromHub
        </Link>
        <nav className="flex shrink-0 gap-6">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="label-mono link-hover whitespace-nowrap text-[11px] tracking-[1.2px] sm:text-xs sm:tracking-[1.8px]">
              {item.label}
            </Link>
          ))}
        </nav>
        <input
          type="search"
          placeholder="Search prompts"
          className="ml-auto hidden w-60 rounded-tag border border-secondary bg-canvas px-3 py-1.5 text-[15px] placeholder:text-secondary transition-colors duration-150 focus:border-mint focus:outline-none lg:block"
        />
        <Link href={user ? "/me" : "/login"} className="label-mono link-hover ml-auto whitespace-nowrap text-[11px] sm:text-xs lg:ml-0">
          {user ? "My Page" : "Log in"}
        </Link>
        <Link href="/new" className="btn-mint shrink-0 whitespace-nowrap px-3 sm:px-5">
          <span className="sm:hidden">+ New</span>
          <span className="hidden sm:inline">New Prompt</span>
        </Link>
      </div>
    </header>
  );
}
