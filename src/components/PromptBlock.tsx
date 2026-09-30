"use client";

import { useState } from "react";

export function PromptBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-tile border border-frame">
      <div className="flex items-center justify-between border-b border-frame px-4 py-2.5">
        <span className="label-mono text-secondary">{label}</span>
        <button onClick={copy} className="label-mono link-hover text-mint">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-[13px] leading-relaxed text-muted">
        {text}
      </p>
    </div>
  );
}
