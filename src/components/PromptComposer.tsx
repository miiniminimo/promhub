"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { chatPromptBuilder, type ChatFileInfo, uploadChatFileAction } from "@/app/actions";
import { AGENTS } from "@/lib/agents";
import { styleOf } from "@/lib/styles";
import type { Style } from "@/lib/types";

/** A chat attachment already stored on the server; `preview` is a local object URL for images. */
type Attachment = ChatFileInfo & { preview?: string };

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
  raw?: string;
  files?: Attachment[];
  /** Assistant turns: which style agent answered, what it referenced and what it filled in. */
  agent?: Style;
  references?: { title: string; url: string }[];
  filled?: string[];
};

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

/** Sets a still-empty field of the surrounding form; returns whether it changed. */
function fillIfEmpty(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement) || field.value.trim() || !value.trim()) return false;
  field.value = value;
  return true;
}

/**
 * Builds the New Prompt form's prompt through a chat with the style agent matching the
 * selected style. The draft is read-only here (changes are requested in the chat) and is
 * submitted via a hidden input.
 */
export function PromptComposer() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<Style>("anime");
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
  const agent = AGENTS[style];

  // Follow the style radio in the surrounding form: it picks which agent answers next.
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;
    const sync = () => setStyle((String(new FormData(form).get("style") ?? "anime") as Style));
    sync();
    form.addEventListener("change", sync);
    return () => form.removeEventListener("change", sync);
  }, []);

  async function addFiles(files: FileList | File[]) {
    setError(null);
    const list = Array.from(files).slice(0, MAX_ATTACHMENTS - attachments.length);
    if (files.length > list.length) setError(`한 번에 최대 ${MAX_ATTACHMENTS}개까지 첨부할 수 있어요.`);
    setUploading((n) => n + list.length);
    await Promise.all(
      list.map(async (file) => {
        const data = new FormData();
        data.set("file", file);
        const res = await uploadChatFileAction(data);
        setUploading((n) => n - 1);
        if (!res.ok) return setError((prev) => (prev ? `${prev}\n${res.error}` : res.error));
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
    const context = { model: String(data?.get("model") ?? ""), style };
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
      const filled = form
        ? [
            fillIfEmpty(form, "title", result.title) && "제목",
            fillIfEmpty(form, "model", result.model) && "사용 모델",
          ].filter((f): f is string => !!f)
        : [];
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: result.reply,
          raw: result.raw,
          agent: result.agent,
          references: result.references,
          filled,
        },
      ]);
      if (result.prompt) setPrompt(result.prompt);
      setReady(result.ready);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    });
  }

  return (
    <div ref={rootRef}>
      <input type="hidden" name="prompt" value={prompt} />

      <div className="flex items-end justify-between gap-4 border-b border-frame pb-3">
        <span className="label-mono text-secondary">프롬프트 *</span>
        <span className="label-mono text-mint">AI 에이전트와 대화로 만들기</span>
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
          <div className="flex items-center gap-3 border-b border-frame px-4 py-3">
            <span className={`label-mono rounded-[20px] px-2.5 py-1 ${styleOf(style).tagClass}`}>{styleOf(style).label}</span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-tight">{agent.name}</p>
              <p className="truncate text-xs text-secondary">{agent.tagline}</p>
            </div>
          </div>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-3 text-sm leading-relaxed text-secondary">
                <p>
                  만들고 싶은 결과물을 설명해 주세요. {agent.name}가 질문하고 PromHub의 비슷한 프롬프트를 참고하며
                  완성해 줘요. 스타일을 바꾸면 담당 에이전트도 바뀌어요.
                </p>
                <div className="flex flex-wrap gap-2">
                  {agent.examples.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setInput(ex)}
                      className="rounded-pill border border-frame px-3 py-1.5 text-left text-xs text-muted transition-colors duration-150 hover:border-mint"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <p>📎 참고 이미지를 올리면 스타일을, 대화 기록(txt·md·pdf)을 올리면 그 안의 프롬프트를 정리해 줘요.</p>
              </div>
            )}
            {messages.map((m, i) => {
              const prevAgent = messages.slice(0, i).findLast((x) => x.agent)?.agent;
              return (
                <div key={i} className={`flex flex-col gap-1.5 ${m.role === "user" ? "items-end" : "items-start"}`}>
                  {m.agent && prevAgent && prevAgent !== m.agent && (
                    <p className="label-mono self-center py-1 text-secondary">— {AGENTS[m.agent].name}로 전환 —</p>
                  )}
                  {m.agent && <span className="label-mono text-secondary">{AGENTS[m.agent].name}</span>}
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
                  {m.references && m.references.length > 0 && (
                    <div className="max-w-[85%] space-y-1">
                      <p className="label-mono text-secondary">참고한 프롬프트</p>
                      {m.references.map((r) => (
                        <Link
                          key={r.url}
                          href={r.url}
                          target="_blank"
                          className="link-hover block truncate text-xs text-mint underline"
                        >
                          ↗ {r.title}
                        </Link>
                      ))}
                    </div>
                  )}
                  {m.filled && m.filled.length > 0 && (
                    <p className="text-xs text-secondary">✓ {m.filled.join(", ")}을(를) 채웠어요</p>
                  )}
                </div>
              );
            })}
            {pending && <p className="label-mono text-secondary">{agent.name}가 참고 자료를 찾고 프롬프트를 다듬는 중…</p>}
          </div>
          {error && <p className="whitespace-pre-line border-t border-frame px-4 py-2 text-sm text-tile-pink">{error}</p>}
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
              prompt.split("\n").map((line, i) => (
                <p
                  key={i}
                  className={`whitespace-pre-wrap break-words ${
                    line.startsWith("Negative prompt:") ? "text-secondary" : "text-muted"
                  }`}
                >
                  {line}
                </p>
              ))
            ) : (
              <p className="text-secondary">대화를 시작하면 여기에 프롬프트 초안이 만들어져요.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
