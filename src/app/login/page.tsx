import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { safeNextPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/lib/server/auth";
import { PageHeading } from "@/components/PageHeading";

export default async function Page(props: PageProps<"/login">) {
  const { next } = await props.searchParams;
  const nextPath = safeNextPath(next, "/me");
  if (await getCurrentUser()) redirect(nextPath);

  return (
    <main className="mx-auto w-full max-w-md px-6 py-16">
      <PageHeading eyebrow="Welcome back" title="Log in" size="form" />
      <AuthForm mode="login" next={nextPath} />
    </main>
  );
}
