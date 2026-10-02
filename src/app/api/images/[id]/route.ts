import { SAFE_IMAGE_TYPES } from "@/lib/image-types";
import { getImage } from "@/lib/server/repos";

export async function GET(_: Request, ctx: RouteContext<"/api/images/[id]">) {
  const { id } = await ctx.params;
  const image = getImage(Number(id));
  if (!image) return new Response("Not found", { status: 404 });

  // Anything that isn't a known raster type (e.g. an SVG stored before uploads were
  // restricted) is served as a download, never rendered on our origin.
  const inline = SAFE_IMAGE_TYPES.includes(image.mime);
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": inline ? image.mime : "application/octet-stream",
      ...(inline ? {} : { "Content-Disposition": "attachment" }),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
