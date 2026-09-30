import type { Style } from "./types";

export const STYLES: { value: Style; label: string; tagClass: string }[] = [
  { value: "anime", label: "애니", tagClass: "bg-tile-pink text-black" },
  { value: "photo", label: "실사", tagClass: "bg-mint text-black" },
  { value: "illustration", label: "일러스트", tagClass: "bg-tile-yellow text-black" },
];

export function styleOf(style: Style) {
  return STYLES.find((s) => s.value === style)!;
}
