"use client";

import { useRef } from "react";

/** Highlights {{variables}} and a trailing "Negative prompt:" label. */
function highlight(text: string) {
  return text.split("\n").map((line, i, lines) => {
    const parts = line.split(/(\{\{\w+\}\})/g).map((part, j) => {
      if (/^\{\{\w+\}\}$/.test(part)) return <span key={j} className="text-mint">{part}</span>;
      if (j === 0 && part.startsWith("Negative prompt:")) {
        return (
          <span key={j}>
            <span className="text-tile-pink">Negative prompt:</span>
            {part.slice("Negative prompt:".length)}
          </span>
        );
      }
      return part;
    });
    return (
      <span key={i}>
        {parts}
        {i < lines.length - 1 && "\n"}
      </span>
    );
  });
}

// Shared metrics so the transparent textarea lines up exactly with the highlight layer.
const TEXT = "font-mono text-[13px] leading-[22px] py-4 pr-4 pl-2 whitespace-pre";

type Props = { value: string; onChange: (v: string) => void; placeholder?: string };

/** Code-editor style prompt input: line numbers, no wrapping, highlighted variables. */
export function PromptEditor({ value, onChange, placeholder }: Props) {
  const gutterRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLPreElement>(null);
  const lineCount = Math.max(value.split("\n").length, 1);

  return (
    <div className="flex h-full min-h-0 bg-[#0d0d0d]">
      <div
        ref={gutterRef}
        aria-hidden
        className="select-none overflow-hidden py-4 pl-4 pr-2 text-right font-mono text-[13px] leading-[22px] text-secondary/50"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="relative min-w-0 flex-1">
        <pre ref={layerRef} aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden text-muted ${TEXT}`}>
          {value ? highlight(value) : <span className="text-secondary">{placeholder}</span>}
          {"\n"}
        </pre>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={(e) => {
            const { scrollTop, scrollLeft } = e.currentTarget;
            if (layerRef.current) {
              layerRef.current.scrollTop = scrollTop;
              layerRef.current.scrollLeft = scrollLeft;
            }
            if (gutterRef.current) gutterRef.current.scrollTop = scrollTop;
          }}
          wrap="off"
          spellCheck={false}
          aria-label="프롬프트 입력"
          className={`absolute inset-0 resize-none overflow-auto bg-transparent text-transparent caret-white selection:bg-ultraviolet/60 focus:outline-none ${TEXT}`}
        />
      </div>
    </div>
  );
}
