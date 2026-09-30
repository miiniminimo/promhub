import { NewPromptForm } from "@/components/NewPromptForm";
import { requireUser } from "@/lib/server/auth";

export default async function NewPromptPage() {
  await requireUser("/new");
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="text-[19px] font-light uppercase tracking-[1.9px] text-secondary">Open a new prompt</p>
      <h1 className="mb-10 mt-3 font-display text-[60px] uppercase leading-[0.95] tracking-[1.07px]">New Prompt</h1>
      <NewPromptForm />
    </main>
  );
}
