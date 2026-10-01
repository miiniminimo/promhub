"use client";

import { useRef, useState, useTransition } from "react";
import { chatPromptBuilder } from "@/app/actions";
import type { Style } from "@/lib/types";
import { monoFieldClass } from "./ui";

type ChatMessage = { role: "user" | "assistant"; text: string; raw?: string };

const TABS = [
  { value: "chat", label: "AI와 대화로 만들기" },
  { value: "manual", label: "직접 입력" },
] as const;

/**
 * Prompt + negative prompt inputs for the New Prompt form. The values are always
 * submitted through hidden inputs, whichever tab the user ends up on.
 */
export function PromptComposer() {
  const [tab, setTab] = useState<"chat" | "manual">("chat");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  function send() {
    const text = input.trim();
    if (!text || pending) return;
    // Read the model/style the user picked elsewhere in the same form.
    const form = rootRef.current?.closest("form");
    const data = form ? new FormData(form) : null;
    const context = {
      model: String(data?.get("model") ?? ""),
      style: (String(data?.get("style") ?? "anime") as Style),
    };
    const history = messages.map((m) => ({ role: m.role, content: m.role === "assistant" ? m.raw ?? m.text : m.text }));

    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");
    setError(null);
    startTransition(async () => {
      const res = await chatPromptBuilder(history, text, context);
      if (!res.ok) {
        setError(res.error);
        setMessages((prev) => prev.slice(0, -1));
        setInput(text);
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

      <div className="flex items-end justify-between gap-4 border-b border-frame">
        <span className="label-mono pb-3 text-secondary">프롬프트 *</span>
        <div className="flex gap-5">
          {TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={`label-mono pb-3 tracking-[1.5px] transition-colors duration-150 ${
                tab === t.value
                  ? "text-mint shadow-[inset_0_-1px_0_0_var(--color-mint)]"
                  : "text-secondary hover:text-link-hover"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "chat" ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Chat */}
          <div className="flex h-[420px] flex-col rounded-tile border border-frame">
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <p className="text-sm leading-relaxed text-secondary">
                  만들고 싶은 결과물을 설명해 주세요. AI가 질문하면서 프롬프트를 완성해 줘요.
                  <br />
                  <span className="text-muted">예: 비 오는 밤 네온사인 거리를 걷는 고양이</span>
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <p
                    className={`max-w-[85%] whitespace-pre-wrap rounded-tile px-4 py-2.5 text-[14px] leading-relaxed ${
                      m.role === "user" ? "bg-mint text-black" : "bg-slate text-muted"
                    }`}
                  >
                    {m.text}
                  </p>
                </div>
              ))}
              {pending && <p className="label-mono text-secondary">AI가 프롬프트를 다듬는 중…</p>}
            </div>
            {error && <p className="border-t border-frame px-4 py-2 text-sm text-tile-pink">{error}</p>}
            <div className="flex gap-2 border-t border-frame p-3">
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
                disabled={pending || !input.trim()}
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
              <button
                type="button"
                onClick={() => setTab("manual")}
                disabled={!prompt}
                className="label-mono link-hover text-mint disabled:text-secondary"
              >
                직접 수정하기 →
              </button>
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
      ) : (
        <div className="mt-4 space-y-6">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={8}
            placeholder="프롬프트를 직접 입력하세요"
            className={monoFieldClass}
          />
          <label className="block">
            <span className="label-mono text-secondary">Negative prompt</span>
            <textarea
              value={negativePrompt}
              onChange={(e) => setNegativePrompt(e.target.value)}
              rows={3}
              className={`${monoFieldClass} mt-2`}
            />
          </label>
        </div>
      )}
    </div>
  );
}
