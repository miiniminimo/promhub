/**
 * Returns `next` only if it is a same-origin path, otherwise `fallback`.
 * Rejects absolute URLs, protocol-relative "//host" and "/\host" (browsers treat the
 * backslash as a slash), and anything that resolves to another origin.
 */
export function safeNextPath(next: unknown, fallback = "/") {
  if (typeof next !== "string" || !next.startsWith("/") || /^\/[\\/]/.test(next)) return fallback;
  if (/[\u0000-\u001f]/.test(next)) return fallback;
  const base = "http://promhub.invalid";
  try {
    return new URL(next, base).origin === base ? next : fallback;
  } catch {
    return fallback;
  }
}
