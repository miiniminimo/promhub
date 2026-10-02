import { AuthPage } from "@/components/AuthPage";

export default async function Page(props: PageProps<"/login">) {
  return <AuthPage mode="login" next={(await props.searchParams).next} />;
}
