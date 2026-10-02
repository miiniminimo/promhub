import { AuthPage } from "@/components/AuthPage";

export default async function Page(props: PageProps<"/signup">) {
  return <AuthPage mode="signup" next={(await props.searchParams).next} />;
}
