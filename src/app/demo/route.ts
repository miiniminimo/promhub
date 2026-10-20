import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { createSession } from "@/lib/server/auth";
import { demoRouteEnabled, seedDemo } from "@/lib/server/demo-seed";

/**
 * Demo-video shortcut: seeds the demo accounts and signs in as `demo`.
 *   /demo            → keep existing demo data, go to /me
 *   /demo?reset=1    → rebuild the demo data from scratch
 *   /demo?next=/new  → land on another page after signing in
 */
export async function GET(request: Request) {
  if (!demoRouteEnabled()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const userId = seedDemo({ reset: url.searchParams.has("reset") });
  await createSession(userId);
  redirect(safeNextPath(url.searchParams.get("next"), "/me"));
}
