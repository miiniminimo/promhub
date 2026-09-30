import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForkButton } from "@/components/ForkButton";
import { PromptBlock } from "@/components/PromptBlock";
import { StyleTag } from "@/components/StyleTag";
import { getPost } from "@/lib/posts";

export default async function PostPage(props: PageProps<"/p/[id]">) {
  const { id } = await props.params;
  const post = getPost(id);
  if (!post) notFound();

  const params = [
    ["Sampler", post.params.sampler],
    ["Steps", post.params.steps],
    ["CFG", post.params.cfgScale],
    ["Seed", post.params.seed],
  ].filter(([, v]) => v != null);

  return (
    <main className="mx-auto grid w-full max-w-[1300px] gap-8 px-6 py-10 lg:grid-cols-[minmax(0,1fr)_420px] lg:px-12">
      <div className="space-y-4">
        {post.images.map((img, i) => (
          <Image
            key={img.src}
            src={img.src}
            alt={`${post.title} ${i + 1}`}
            width={img.width}
            height={img.height}
            loading={i === 0 ? "eager" : "lazy"}
            className="mx-auto h-auto max-h-[85vh] w-auto rounded-tile border border-frame"
          />
        ))}
      </div>

      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <div>
          <StyleTag style={post.style} />
          <h1 className="mt-3 text-[28px] font-bold leading-tight">{post.title}</h1>
          <p className="label-mono mt-3 font-normal text-secondary">
            @{post.author} · ♥ {post.likes.toLocaleString()} · {post.createdAt.slice(0, 10)}
          </p>
        </div>

        <ForkButton postId={post.id} />

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-tile border border-frame bg-frame">
          <div className="col-span-2 bg-canvas px-4 py-3">
            <dt className="label-mono text-secondary">사용 모델</dt>
            <dd className="mt-1 text-lg font-bold">{post.model}</dd>
          </div>
          {params.map(([label, value]) => (
            <div key={label} className="bg-canvas px-4 py-3">
              <dt className="label-mono text-secondary">{label}</dt>
              <dd className="mt-1 font-mono text-sm">{value}</dd>
            </div>
          ))}
        </dl>

        <PromptBlock label="Prompt" text={post.prompt} />
        {post.negativePrompt && <PromptBlock label="Negative prompt" text={post.negativePrompt} />}

        <Link
          href={post.sourceUrl}
          target="_blank"
          className="label-mono link-hover block text-secondary"
        >
          원본 보기 · Civitai ↗
        </Link>
      </aside>
    </main>
  );
}
