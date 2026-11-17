"use client";

import Link from "next/link";
import { useActionState, useCallback, useState } from "react";
import { commitAction } from "@/app/actions";
import type { Style } from "@/lib/types";
import { PromptComposer } from "./PromptComposer";
import { ResultImageInput } from "./ResultImageInput";

type Props = { repoId: number; prompt: string; style: Style; model: string; version: number; previewEnabled: boolean };

/** New version of a repo: the change is made by chatting with the style agent, then committed. */
export function CommitForm({ repoId, prompt: base, style, model, version, previewEnabled }: Props) {
  // Pass the repo id as a form field rather than binding it on the client: a client-bound
  // action re-rendered after a no-JS (MPA) submission sent React's server renderer into an
  // endless retry loop (QA finding).
  const [state, action, pending] = useActionState(commitAction, undefined);
  const [draft, setDraft] = useState({ prompt: base, hasPreview: false });
  const [hasFile, setHasFile] = useState(false);
  const onChange = useCallback((prompt: string, hasPreview: boolean) => setDraft({ prompt, hasPreview }), []);
  // A new result image alone is also a new version.
  const unchanged = draft.prompt.trim() === base.trim() && !draft.hasPreview && !hasFile;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="repoId" value={repoId} />
      <PromptComposer previewEnabled={previewEnabled} edit={{ base, style, model, version }} onChange={onChange} />
      <ResultImageInput label="결과 이미지 직접 올리기 (선택, 5MB 이하 — 올리면 채팅 미리보기 대신 사용)" onChange={setHasFile} />
      {state?.error && <p className="text-sm text-muted">{state.error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={unchanged || pending} className="btn-mint disabled:opacity-40">
          커밋
        </button>
        <Link href={`/repos/${repoId}`} className="btn-slate">
          취소
        </Link>
        {unchanged && <span className="text-sm text-secondary">채팅으로 바꿀 부분을 요청하면 커밋할 수 있어요.</span>}
      </div>
    </form>
  );
}
