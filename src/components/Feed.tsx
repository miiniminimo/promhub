"use client";

import { useState } from "react";
import { STYLES } from "@/lib/styles";
import type { FeedItem, Style } from "@/lib/types";
import { FeedCard } from "./FeedCard";

const TABS: { value: Style | "all"; label: string }[] = [{ value: "all", label: "전체" }, ...STYLES];

export function Feed({ items }: { items: FeedItem[] }) {
  const [style, setStyle] = useState<Style | "all">("all");
  const visible = style === "all" ? items : items.filter((i) => i.style === style);

  return (
    <>
      <div className="mb-8 flex gap-6 overflow-x-auto border-b border-frame">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStyle(tab.value)}
            className={`label-mono shrink-0 pb-3 text-xs tracking-[1.8px] transition-colors duration-150 ${
              style === tab.value
                ? "text-mint shadow-[inset_0_-1px_0_0_var(--color-mint)]"
                : "text-secondary hover:text-link-hover"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
        {visible.map((item, i) => (
          <FeedCard key={item.key} item={item} eager={i === 0} />
        ))}
      </div>
    </>
  );
}
