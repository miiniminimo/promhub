"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { commitAction } from "@/app/actions";
import { fieldClass, monoFieldClass } from "./ui";

type Props = { repoId: number; prompt: string };

export function CommitForm({ repoId, prompt: initialPrompt }: Props) {
  // Pass the repo id as a form field rather than binding it on the client: a client-bound
  // action re-rendered after a no-JS (MPA) submission sent React's server renderer into an
  // endless retry loop (QA finding).
  const [state, action, pending] = useActionState(commitAction, undefined);
  const [prompt, setPrompt] = useState(initialPrompt);
  const unchanged = prompt.trim() === initialPrompt.trim();

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="repoId" value={repoId} />
      <label className="block">
        <span className="label-mono text-secondary">Prompt</span>
        <textarea
          name="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={9}
          className={`${monoFieldClass} mt-2`}
        />
      </label>
      <label className="block">
        <span className="label-mono text-secondary">Commit message</span>
        <input name="message" placeholder="예: 조명을 golden hour 로 변경" className={`${fieldClass} mt-2`} />
      </label>
      {state?.error && <p className="text-sm text-muted">{state.error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={unchanged || pending} className="btn-mint disabled:opacity-40">
          커밋
        </button>
        <Link href={`/repos/${repoId}`} className="label-mono rounded-[24px] bg-slate px-5 py-2 leading-[2] text-muted">
          취소
        </Link>
      </div>
    </form>
  );
}
