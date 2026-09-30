import { styleOf } from "@/lib/styles";
import type { Style } from "@/lib/types";

export function StyleTag({ style }: { style: Style }) {
  const { label, tagClass } = styleOf(style);
  return (
    <span className={`label-mono inline-block rounded-[20px] px-2.5 py-1 tracking-[1.8px] ${tagClass}`}>
      {label}
    </span>
  );
}
