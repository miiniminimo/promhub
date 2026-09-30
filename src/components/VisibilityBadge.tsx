import type { Visibility } from "@/lib/server/repos";

export function VisibilityBadge({ visibility }: { visibility: Visibility }) {
  return (
    <span
      className={`label-mono rounded-pill border px-2.5 py-1 ${
        visibility === "public" ? "border-mint text-mint" : "border-secondary text-secondary"
      }`}
    >
      {visibility === "public" ? "공개" : "비공개"}
    </span>
  );
}
