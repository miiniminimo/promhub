import { getImage } from "@/lib/server/repos";

export async function GET(_: Request, ctx: RouteContext<"/api/images/[id]">) {
  const { id } = await ctx.params;
  const image = getImage(Number(id));
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: { "Content-Type": image.mime, "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
