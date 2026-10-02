import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/lib/server/auth";
import { AuthForm } from "./AuthForm";
import { PageHeading } from "./PageHeading";

const COPY = {
  login: { eyebrow: "Welcome back", title: "Log in" },
  signup: { eyebrow: "Start versioning your prompts", title: "Sign up" },
};

/** Shared /login and /signup page: already signed-in users go straight to `next`. */
export async function AuthPage({ mode, next }: { mode: "login" | "signup"; next: unknown }) {
  const nextPath = safeNextPath(next, "/me");
  if (await getCurrentUser()) redirect(nextPath);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <PageHeading {...COPY[mode]} size="form" />
      <AuthForm mode={mode} next={nextPath} />
    </main>
  );
}
