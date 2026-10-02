import { NewPromptForm } from "@/components/NewPromptForm";
import { requireUser } from "@/lib/server/auth";
import { PageHeading } from "@/components/PageHeading";

export default async function NewPromptPage() {
  await requireUser("/new");
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <PageHeading eyebrow="Open a new prompt" title="New Prompt" size="form" />
      <NewPromptForm />
    </main>
  );
}
