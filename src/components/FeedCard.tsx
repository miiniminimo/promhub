import Image from "next/image";
import Link from "next/link";
import { styleOf } from "@/lib/styles";
import type { FeedItem } from "@/lib/types";
import { StyleTag } from "./StyleTag";

export function FeedCard({ item }: { item: FeedItem }) {
  return (
    <Link
      href={item.href}
      className="group mb-4 block break-inside-avoid rounded-tile border border-frame bg-canvas p-2"
    >
      {item.cover ? (
        <Image
          src={item.cover.src}
          alt={item.title}
          width={item.cover.width}
          height={item.cover.height}
          loading="lazy"
          className="h-auto w-full rounded-[14px]"
        />
      ) : (
        // No result image: a saturated color-block tile showing the prompt itself.
        <div className={`rounded-[14px] p-5 ${styleOf(item.style).tagClass}`}>
          <p className="label-mono opacity-70">Prompt</p>
          <p className="mt-3 line-clamp-6 font-mono text-[13px] leading-relaxed">{item.excerpt}</p>
        </div>
      )}

      <div className="px-2 pb-2 pt-3">
        <StyleTag style={item.style} />
        <p className="mt-2.5 text-lg font-bold leading-tight transition-colors duration-150 group-hover:text-link-hover">
          {item.title}
        </p>
        <p className="label-mono mt-2 font-normal text-secondary">
          @{item.author}
          {item.likes != null && ` · ♥ ${item.likes.toLocaleString()}`}
        </p>
      </div>
    </Link>
  );
}
