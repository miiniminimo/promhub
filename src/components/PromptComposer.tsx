"use client";

import { useRef, useState, useTransition } from "react";
import { chatPromptBuilder, type ChatFileInfo, uploadChatFileAction } from "@/app/actions";
import type { Style } from "@/lib/types";

/** A chat attachment already stored on the server; `preview` is a local object URL for images. */
type Attachment = ChatFileInfo & { preview?: string };

type ChatMessage = { role: "user" | "assistant"; text: string; raw?: string; files?: Attachment[] };

const ACCEPT = "image/jpeg,image/png,image/gif,image/webp,application/pdf,.txt,.md,.json,.csv,.log,text/*";
const MAX_ATTACHMENTS = 5;

function AttachmentChip({ file, onRemove }: { file: Attachment; onRemove?: () => void }) {
  return (
    <span className="flex max-w-56 items-center gap-2 rounded-img border border-frame bg-canvas px-2 py-1 text-xs text-muted">
      {file.preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob preview
        <img src={file.preview} alt="" className="size-8 rounded-tag object-cover" />
      ) : (
        <span className="label-mono text-secondary">{file.mime === "application/pdf" ? "PDF" : "TXT"}</span>
      )}
      <span className="truncate">{file.name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`${file.name} 제거`} className="text-secondary hover:text-white">
          ✕
        </button>
      )}
    </span>
  );
}

/**
 * Builds the New Prompt form's prompt through a chat with the AI. The current draft is
 * read-only here (changes are requested in the chat) and is submitted via hidden inputs.
 */
export function PromptComposer() {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  async function addFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, MAX_ATTACHMENTS - attachments.length);
    if (files.length > list.length) setError(`한 번에 최대 ${MAX_ATTACHMENTS}개까지 첨부할 수 있어요.`);
    setUploading((n) => n + list.length);
    await Promise.all(
      list.map(async (file) => {
        const data = new FormData();
        data.set("file", file);
        const res = await uploadChatFileAction(data);
        setUploading((n) => n - 1);
        if (!res.ok) return setError(res.error);
        const preview = res.file.mime.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setAttachments((prev) => [...prev, { ...res.file, preview }]);
      }),
    );
  }

  function send() {
    const text = input.trim();
    if ((!text && attachments.length === 0) || pending || uploading > 0) return;
    const files = attachments;
    // Read the model/style the user picked elsewhere in the same form.
    const form = rootRef.current?.closest("form");
    const data = form ? new FormData(form) : null;
    const context = {
      model: String(data?.get("model") ?? ""),
      style: (String(data?.get("style") ?? "anime") as Style),
    };
    const history = messages.map((m) => ({
      role: m.role,
      content: m.role === "assistant" ? m.raw ?? m.text : m.text,
      fileIds: m.files?.map((f) => f.id),
    }));

    setMessages((prev) => [...prev, { role: "user", text, files }]);
    setInput("");
    setAttachments([]);
    setError(null);
    startTransition(async () => {
      const res = await chatPromptBuilder(
        history,
        text,
        files.map((f) => f.id),
        context,
      );
      if (!res.ok) {
        setError(res.error);
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
        setAttachments(files);
        return;
      }
      const { result } = res;
      setMessages((prev) => [...prev, { role: "assistant", text: result.reply, raw: result.raw }]);
      if (result.prompt) setPrompt(result.prompt);
      setNegativePrompt(result.negativePrompt);
      setReady(result.ready);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    });
  }

  return (
    <div ref={rootRef}>
      <input type="hidden" name="prompt" value={prompt} />
      <input type="hidden" name="negativePrompt" value={negativePrompt} />

      <div className="flex items-end justify-between gap-4 border-b border-frame pb-3">
        <span className="label-mono text-secondary">프롬프트 *</span>
        <span className="label-mono text-mint">AI와 대화로 만들기</span>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Chat */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          className={`flex h-[420px] flex-col rounded-tile border transition-colors duration-150 ${
            dragging ? "border-mint" : "border-frame"
          }`}
        >
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-sm leading-relaxed text-secondary">
                만들고 싶은 결과물을 설명해 주세요. AI가 질문하면서 프롬프트를 완성해 줘요.
                <br />
                <span className="text-muted">예: 비 오는 밤 네온사인 거리를 걷는 고양이</span>
                <br />
                <br />
                📎 참고 이미지를 올리면 스타일을, 대화 기록(txt·md·pdf)을 올리면 그 안의 프롬프트를 정리해 줘요.
                파일을 여기로 끌어다 놓아도 돼요.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
                {m.files && m.files.length > 0 && (
                  <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {m.files.map((f) => (
                      <AttachmentChip key={f.id} file={f} />
                    ))}
                  </div>
                )}
                {m.text && (
                  <p
                    className={`max-w-[85%] whitespace-pre-wrap rounded-tile px-4 py-2.5 text-[14px] leading-relaxed ${
                      m.role === "user" ? "bg-mint text-black" : "bg-slate text-muted"
                    }`}
                  >
                    {m.text}
                  </p>
                )}
              </div>
            ))}
            {pending && <p className="label-mono text-secondary">AI가 프롬프트를 다듬는 중…</p>}
          </div>
          {error && <p className="border-t border-frame px-4 py-2 text-sm text-tile-pink">{error}</p>}
          {(attachments.length > 0 || uploading > 0) && (
            <div className="flex flex-wrap gap-1.5 border-t border-frame px-3 pt-3">
              {attachments.map((f) => (
                <AttachmentChip
                  key={f.id}
                  file={f}
                  onRemove={() => setAttachments((prev) => prev.filter((a) => a.id !== f.id))}
                />
              ))}
              {uploading > 0 && <span className="label-mono self-center text-secondary">업로드 중…</span>}
            </div>
          )}
          <div className="flex gap-2 border-t border-frame p-3">
            <label
              title="파일 첨부 (이미지·텍스트·PDF)"
              className="cursor-pointer self-end rounded-full bg-slate px-3 py-2 text-sm text-muted transition-colors duration-150 hover:bg-white/20"
            >
              📎
              <input
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={2}
              placeholder="메시지 입력 (Enter 전송, Shift+Enter 줄바꿈)"
              className="flex-1 resize-none bg-transparent px-2 py-1 text-[14px] text-white placeholder:text-secondary focus:outline-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={pending || uploading > 0 || (!input.trim() && attachments.length === 0)}
              className="btn-mint self-end disabled:opacity-40"
            >
              전송
            </button>
          </div>
        </div>

        {/* Live draft */}
        <div className="flex h-[420px] flex-col rounded-tile border border-frame">
          <div className="flex items-center justify-between border-b border-frame px-4 py-2.5">
            <span className="label-mono text-secondary">
              초안 {ready && <span className="ml-2 text-mint">● 완성</span>}
            </span>
            <span className="text-xs text-secondary">고칠 부분은 채팅으로 요청하세요</span>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 font-mono text-[13px] leading-relaxed">
            {prompt ? (
              <>
                <p className="whitespace-pre-wrap break-words text-muted">{prompt}</p>
                {negativePrompt && (
                  <div>
                    <p className="label-mono text-secondary">Negative</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-secondary">{negativePrompt}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-secondary">대화를 시작하면 여기에 프롬프트 초안이 만들어져요.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
