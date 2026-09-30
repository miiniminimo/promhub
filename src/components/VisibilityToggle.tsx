import { toggleVisibilityAction } from "@/app/actions";
import type { Visibility } from "@/lib/server/repos";

export function VisibilityToggle({ repoId, visibility }: { repoId: number; visibility: Visibility }) {
  const isPublic = visibility === "public";
  return (
    <form action={toggleVisibilityAction.bind(null, repoId)}>
      <button
        type="submit"
        title={isPublic ? "누르면 비공개로 전환" : "누르면 공개로 전환"}
        className={`label-mono flex items-center gap-2 rounded-pill border px-3 py-1.5 transition-colors duration-150 ${
          isPublic ? "border-mint text-mint" : "border-secondary text-secondary"
        } hover:border-white hover:text-white`}
      >
        <span className={`size-2 rounded-full ${isPublic ? "bg-mint" : "bg-secondary"}`} />
        {isPublic ? "공개" : "비공개"}
      </button>
    </form>
  );
}
