"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  chatPromptBuilder,
  type ChatFileInfo,
  generatePreviewAction,
  type PreviewImage,
  uploadChatFileAction,
} from "@/app/actions";
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
  /** Assistant turns that changed the prompt carry the new draft (and whether it is complete). */
  draft?: string;
  ready?: boolean;
  /** Target image model the agent wrote this draft for. */
  model?: string;
  /** A rendered preview of the draft called `label`. */
  preview?: PreviewImage & { label: string };
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

/** A prompt draft shown inside the chat; earlier drafts are dimmed so the latest one stands out. */
type DraftCardProps = {
  text: string;
  model?: string;
  /** "초안 v2" when creating, "현재 v3" / "수정안 1" when editing a saved version. */
  label: string;
  ready: boolean;
  latest: boolean;
  /** Shown on the latest draft: renders it with the image model. */
  preview?: { onClick: () => void; busy: boolean; enabled: boolean };
};

function DraftCard({ text, model, label, ready, latest, preview }: DraftCardProps) {
  return (
    <div className={`w-full max-w-[85%] rounded-tile border ${latest ? "border-mint" : "border-frame opacity-60"}`}>
      <p className="label-mono flex items-center gap-2 border-b border-frame px-4 py-2 text-secondary">
        {label}
        {latest && <span className="text-mint">{ready ? "● 완성" : "최신"}</span>}
        {model && <span className="ml-auto font-normal normal-case">{model}</span>}
      </p>
      <div className="space-y-2 px-4 py-3 font-mono text-[13px] leading-relaxed">
        {text.split("\n").map((line, i) => (
          <p
            key={i}
            className={`whitespace-pre-wrap break-words ${line.startsWith("Negative prompt:") ? "text-secondary" : "text-muted"}`}
          >
            {line}
          </p>
        ))}
      </div>
      {preview && (
        <div className="flex items-center gap-3 border-t border-frame px-4 py-2.5">
          <button
            type="button"
            onClick={preview.onClick}
            disabled={preview.busy || !preview.enabled}
            className="btn-mint disabled:opacity-40"
          >
            {preview.busy ? "그리는 중…" : "이미지 미리보기"}
          </button>
          <span className="text-xs text-secondary">
            {preview.enabled ? "이 초안으로 결과 이미지를 그려봐요" : "OpenAI API 키가 있어야 사용할 수 있어요"}
          </span>
        </div>
      )}
    </div>
  );
}

/** A rendered preview in the chat, which the user can pick as the new repo's result image. */
function PreviewBubble({ image, chosen, onChoose }: { image: PreviewImage & { label: string }; chosen: boolean; onChoose: () => void }) {
  return (
    <figure className={`w-full max-w-[85%] rounded-tile border p-2 ${chosen ? "border-mint" : "border-frame"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- just-generated upload, already sized */}
      <img src={image.src} alt={`${image.label} 미리보기`} width={image.width} height={image.height} className="h-auto w-full rounded-[14px]" />
      <figcaption className="flex flex-wrap items-center gap-3 px-2 pb-1 pt-2.5">
        <span className="label-mono font-normal text-secondary">
          {image.label} 미리보기 · {image.model}
        </span>
        <button
          type="button"
          onClick={onChoose}
          aria-pressed={chosen}
          className={`label-mono ml-auto rounded-pill border px-3 py-1.5 transition-colors duration-150 ${
            chosen ? "border-mint bg-mint text-black" : "border-frame text-muted hover:border-mint"
          }`}
        >
          {chosen ? "✓ 결과 이미지로 선택됨" : "결과 이미지로 사용"}
        </button>
      </figcaption>
    </figure>
  );
}

const MAX_COMMIT_MESSAGE = 100;

/** The user's requests in this chat, e.g. "은발로 바꿔줘 · 배경을 밤으로". */
function commitMessage(messages: ChatMessage[]) {
  const text = messages
    .filter((m) => m.role === "user" && m.text)
    .map((m) => m.text.replace(/\s+/g, " ").trim())
    .join(" · ");
  return text.length > MAX_COMMIT_MESSAGE ? `${text.slice(0, MAX_COMMIT_MESSAGE - 1)}…` : text;
}

/** Sets a still-empty field of the surrounding form; returns whether it changed. */
function fillIfEmpty(form: HTMLFormElement, name: string, value: string) {
  const field = form.elements.namedItem(name);
  if (!(field instanceof HTMLInputElement) || field.value.trim() || !value.trim()) return false;
  field.value = value;
  return true;
}

/** Editing a saved version: the chat starts from its prompt, with the repo's style and model fixed. */
export type ComposerEdit = { base: string; style: Style; model: string; version: number };

type ComposerProps = {
  previewEnabled: boolean;
  edit?: ComposerEdit;
  /** Called with the current draft and whether a preview is picked as the result image. */
  onChange?: (prompt: string, hasPreview: boolean) => void;
};

/** The agent's opening turn in edit mode, holding the saved prompt as its "draft". */
function editOpening({ base, style, model, version }: ComposerEdit): ChatMessage {
  const reply = `지금 v${version} 프롬프트예요. 바꾸고 싶은 부분을 말씀해 주세요. (예: 머리색을 은발로, 배경을 밤으로)`;
  const raw = JSON.stringify({ reply, prompt: base, ready: true, title: "", model, references: [] });
  return { role: "assistant", text: reply, raw, agent: style, draft: base, ready: true, model };
}

/**
 * Builds a prompt through a chat with the style agent: on the New Prompt form (style picked in
 * the form) or, with `edit`, to revise a saved version. Each reply that changes the prompt shows
 * the new draft inside the chat; the latest draft is submitted via a hidden input.
 */
export function PromptComposer({ previewEnabled, edit, onChange }: ComposerProps) {
  const [prompt, setPrompt] = useState(edit?.base ?? "");
  // Target model per style agent: the agent's pick (users can ask for another one in the chat).
  const [models, setModels] = useState<Partial<Record<Style, string>>>(edit ? { [edit.style]: edit.model } : {});
  const [style, setStyle] = useState<Style>(edit?.style ?? "anime");
  const [messages, setMessages] = useState<ChatMessage[]>(edit ? [editOpening(edit)] : []);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [previewing, startPreview] = useTransition();
  const [chosen, setChosen] = useState<(PreviewImage & { label: string }) | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const agent = AGENTS[style];
  const model = models[style] ?? "";

  // Follow the style radio in the surrounding form: it picks which agent answers next.
  // (In edit mode the repo's style is fixed.)
  const editing = !!edit;
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form || editing) return;
    const sync = () => setStyle((String(new FormData(form).get("style") ?? "anime") as Style));
    sync();
    form.addEventListener("change", sync);
    return () => form.removeEventListener("change", sync);
  }, [editing]);

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
    // The style comes from the surrounding form; the title is filled into it below.
    const form = rootRef.current?.closest("form");
    const context = { model, style, ...(edit && { base: edit.base }) };
    // Preview bubbles are UI only; the agent sees the conversation and its own drafts.
    const history = messages.filter((m) => !m.preview).map((m) => ({
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
      setRemaining(res.remainingToday);
      // New prompt: the agent's title fills the form (an edit has no title to fill).
      const filled = form && !edit ? [fillIfEmpty(form, "title", result.title) && "제목을"].filter((f): f is string => !!f) : [];
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: result.reply,
          raw: result.raw,
          agent: result.agent,
          references: result.references,
          filled,
          ...(result.prompt && result.prompt !== prompt
            ? { draft: result.prompt, ready: result.ready, model: result.model }
            : {}),
        },
      ]);
      if (result.prompt) setPrompt(result.prompt);
      if (result.model) setModels((prev) => ({ ...prev, [result.agent]: result.model }));
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    });
  }

  const draftCount = messages.filter((m) => m.draft).length;
  const draftLabel = (n: number) => (edit ? (n === 1 ? `현재 v${edit.version}` : `수정안 ${n - 1}`) : `초안 v${n}`);

  useEffect(() => onChange?.(prompt, !!chosen), [onChange, prompt, chosen]);

  function preview() {
    if (!prompt || previewing) return;
    const label = draftLabel(draftCount);
    setError(null);
    startPreview(async () => {
      const res = await generatePreviewAction(prompt, style);
      if (!res.ok) return setError(res.error);
      setMessages((prev) => [...prev, { role: "assistant", text: "", preview: { ...res.image, label } }]);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
    });
  }

  return (
    <div ref={rootRef}>
      <input type="hidden" name="prompt" value={prompt} />
      <input type="hidden" name="model" value={model || agent.defaultModel} />
      {/* The picked preview becomes the result image of v1 (the server re-checks ownership). */}
      <input type="hidden" name="previewImage" value={chosen?.src ?? ""} />
      <input type="hidden" name="previewWidth" value={chosen?.width ?? ""} />
      <input type="hidden" name="previewHeight" value={chosen?.height ?? ""} />
      <input type="hidden" name="previewModel" value={chosen?.model ?? ""} />
      {/* Edit: the commit message is what was asked for in this chat (the server fills a default otherwise). */}
      {edit && <input type="hidden" name="message" value={commitMessage(messages)} />}

      <div className="flex items-end justify-between gap-4 border-b border-frame pb-3">
        <span className="label-mono text-secondary">프롬프트 *</span>
        <span className="label-mono text-mint">{edit ? "AI 에이전트와 대화로 수정하기" : "AI 에이전트와 대화로 만들기"}</span>
      </div>

      <div className="mt-4">
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
          className={`flex h-[560px] flex-col rounded-tile border transition-colors duration-150 ${
            dragging ? "border-mint" : "border-frame"
          }`}
        >
          <div className="flex items-center gap-3 border-b border-frame px-4 py-3">
            <span className={`label-mono rounded-[20px] px-2.5 py-1 ${styleOf(style).tagClass}`}>{styleOf(style).label}</span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-tight">{agent.name}</p>
              <p className="truncate text-xs text-secondary">{agent.tagline}</p>
            </div>
            {remaining !== null && (
              <span className="label-mono ml-auto shrink-0 font-normal text-secondary">오늘 {remaining}회 남음</span>
            )}
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
                  {m.draft && (
                    <DraftCard
                      text={m.draft}
                      label={draftLabel(messages.slice(0, i + 1).filter((x) => x.draft).length)}
                      model={m.model}
                      ready={!!m.ready}
                      preview={
                        m.draft === prompt && !messages.slice(i + 1).some((x) => x.draft)
                          ? { onClick: preview, busy: previewing, enabled: previewEnabled && !pending }
                          : undefined
                      }
                      latest={m.draft === prompt && !messages.slice(i + 1).some((x) => x.draft)}
                    />
                  )}
                  {m.preview && (
                    <PreviewBubble
                      image={m.preview}
                      chosen={chosen?.src === m.preview.src}
                      onChoose={() => setChosen(chosen?.src === m.preview!.src ? null : m.preview!)}
                    />
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
                    <p className="text-xs text-secondary">✓ {m.filled.join(", ")} 채웠어요</p>
                  )}
                </div>
              );
            })}
            {pending && <p className="label-mono text-secondary">{agent.name}가 참고 자료를 찾고 프롬프트를 다듬는 중…</p>}
            {previewing && <p className="label-mono text-secondary">{draftLabel(draftCount)}로 이미지를 그리는 중… (20~40초)</p>}
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
      </div>
      {chosen && (
        <div className="mt-3 flex items-center gap-3 rounded-tile border border-mint px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- the user's own generated preview */}
          <img src={chosen.src} alt="" className="size-12 rounded-img object-cover" />
          <p className="text-sm text-muted">
            {chosen.label} 미리보기를 <span className="text-mint">{edit ? "새 버전의 결과 이미지" : "v1 결과 이미지"}</span>로
            저장해요 ·{" "}
            <span className="text-secondary">{chosen.model}</span>
          </p>
          <button type="button" onClick={() => setChosen(null)} className="label-mono link-hover ml-auto text-secondary">
            선택 해제
          </button>
        </div>
      )}
    </div>
  );
}
