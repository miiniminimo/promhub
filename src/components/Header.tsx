import Link from "next/link";
import { getCurrentUser } from "@/lib/server/auth";

const NAV = [
  { href: "/", label: "Explore", className: "" },
];

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-20 border-b border-frame bg-canvas">
      <div className="mx-auto flex h-16 max-w-[1300px] items-center gap-4 px-6 sm:gap-8 lg:px-12">
        <Link href="/" className="font-display text-3xl uppercase leading-none tracking-[1px]">
          PromHub
        </Link>
        <nav className="flex gap-6">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className={`label-mono link-hover text-xs tracking-[1.8px] ${item.className}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <input
          type="search"
          placeholder="Search prompts"
          className="ml-auto hidden w-60 rounded-tag border border-secondary bg-canvas px-3 py-1.5 text-[15px] placeholder:text-secondary transition-colors duration-150 focus:border-mint focus:outline-none lg:block"
        />
        <Link href={user ? "/me" : "/login"} className="label-mono link-hover ml-auto text-xs lg:ml-0">
          {user ? "My Page" : "Log in"}
        </Link>
        <Link href="/new" className="btn-mint">
          New Prompt
        </Link>
      </div>
    </header>
  );
}
