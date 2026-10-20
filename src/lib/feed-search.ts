/** Normalises the `?q=` value: first value only, trimmed, capped so a huge URL can't slow the filter. */
export function searchQuery(raw: string | string[] | undefined): string {
  return (Array.isArray(raw) ? raw[0] : raw ?? "").trim().slice(0, 100);
}

/** True when every whitespace-separated term of `query` appears in one of `fields` (case-insensitive). */
export function matchesQuery(query: string, fields: string[]): boolean {
  const haystack = fields.join("\n").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}
