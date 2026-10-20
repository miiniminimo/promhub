import { diffPrompt, diffStats } from "@/lib/prompt-diff";

const PART_CLASS = {
  same: "",
  add: "rounded-[2px] bg-mint/15 text-mint",
  del: "rounded-[2px] bg-tile-pink/15 text-tile-pink line-through",
} as const;

/** Inline diff of two prompt versions: additions in mint, removals struck through in pink. */
export function PromptDiff({ before, after, label }: { before: string; after: string; label: string }) {
  const parts = diffPrompt(before, after);
  const { added, removed } = diffStats(parts);

  return (
    <div className="rounded-tile border border-frame">
      <div className="flex items-center justify-between gap-4 border-b border-frame px-4 py-2.5">
        <span className="label-mono text-secondary">{label}</span>
        <span className="label-mono">
          <span className="text-mint">+{added}</span> <span className="text-tile-pink">−{removed}</span>
        </span>
      </div>
      {added + removed === 0 ? (
        <p className="px-4 py-3 text-[15px] text-secondary">두 버전의 프롬프트가 같습니다.</p>
      ) : (
        <p className="whitespace-pre-wrap break-words px-4 py-3 font-mono text-[13px] leading-relaxed text-muted">
          {parts.map((p, i) =>
            p.type === "same" ? (
              p.text
            ) : (
              <span key={i} className={PART_CLASS[p.type]}>
                {/* Screen readers get the change type the colour conveys. */}
                <span className="sr-only">{p.type === "add" ? "[추가] " : "[삭제] "}</span>
                {p.text}
              </span>
            ),
          )}
        </p>
      )}
    </div>
  );
}
