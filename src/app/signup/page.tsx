import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/server/auth";

export default async function Page(props: PageProps<"/signup">) {
  const { next } = await props.searchParams;
  const nextPath = typeof next === "string" ? next : "/me";
  if (await getCurrentUser()) redirect(nextPath);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <p className="text-[19px] font-light uppercase tracking-[1.9px] text-secondary">Start versioning your prompts</p>
      <h1 className="mb-10 mt-3 font-display text-[60px] uppercase leading-[0.95] tracking-[1.07px]">Sign up</h1>
      <AuthForm mode="signup" next={nextPath} />
    </main>
  );
}
