import Image from "next/image";
import type { PostImage } from "@/lib/types";

/** A version's result image with its caption; an empty frame when that version has none. */
export function ResultImage({ image, caption }: { image: PostImage | null; caption: string }) {
  return (
    <figure>
      {image ? (
        <a href={image.src} target="_blank" rel="noreferrer" className="block">
          <Image
            src={image.src}
            alt={caption}
            width={image.width}
            height={image.height}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="max-h-[480px] w-auto rounded-img border border-frame object-contain"
          />
        </a>
      ) : (
        <div className="flex aspect-square max-h-60 items-center justify-center rounded-img border border-dashed border-frame text-sm text-secondary">
          결과 이미지 없음
        </div>
      )}
      <figcaption className="label-mono mt-2 font-normal text-secondary">{caption}</figcaption>
    </figure>
  );
}
