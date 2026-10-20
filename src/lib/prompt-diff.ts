export type DiffPart = { type: "same" | "add" | "del"; text: string };

// Above this many LCS cells a diff falls back to "whole text replaced" (keeps huge prompts cheap).
const MAX_CELLS = 250_000;

/** Phrases keep their trailing comma/newline, words their trailing whitespace, so parts join back exactly. */
const phrases = (text: string) => text.split(/(?<=[,\n])/).filter(Boolean);
const words = (text: string) => text.split(/(?<=\s)(?=\S)/).filter(Boolean);
/** Comparison key: the token without surrounding whitespace or a trailing comma. */
const keyOf = (token: string) => token.trim().replace(/,$/, "").trim();

function pushPart(parts: DiffPart[], type: DiffPart["type"], text: string) {
  const last = parts.at(-1);
  if (last?.type === type) last.text += text;
  else parts.push({ type, text });
}

/** LCS diff of two token lists; unchanged tokens are shown as they appear in `b`. */
function diffTokens(a: string[], b: string[]): DiffPart[] {
  const parts: DiffPart[] = [];
  if (a.length * b.length > MAX_CELLS) {
    pushPart(parts, "del", a.join(""));
    pushPart(parts, "add", b.join(""));
    return parts.filter((p) => p.text);
  }
  const ka = a.map(keyOf);
  const kb = b.map(keyOf);
  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = ka[i] === kb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ka[i] === kb[j]) {
      pushPart(parts, "same", b[j]);
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1][j] >= lcs[i][j + 1])) {
      pushPart(parts, "del", a[i++]);
    } else {
      pushPart(parts, "add", b[j++]);
    }
  }
  return parts;
}

/**
 * Diff of two prompt versions. Image prompts are mostly comma-separated tags, so phrases
 * ("golden hour,") are compared first; a phrase that was rewritten (a removal right before an
 * addition) is then diffed word by word, which also covers sentence-style prompts.
 */
export function diffPrompt(before: string, after: string): DiffPart[] {
  const coarse = diffTokens(phrases(before), phrases(after));
  const parts: DiffPart[] = [];
  for (let k = 0; k < coarse.length; k++) {
    const [cur, next] = [coarse[k], coarse[k + 1]];
    if (cur.type === "del" && next?.type === "add") {
      for (const p of diffTokens(words(cur.text), words(next.text))) pushPart(parts, p.type, p.text);
      k++;
    } else {
      pushPart(parts, cur.type, cur.text);
    }
  }
  return parts;
}

/** Number of added / removed phrases (whitespace-only changes don't count), for the "+N −M" summary. */
export function diffStats(parts: DiffPart[]) {
  const count = (type: DiffPart["type"]) =>
    parts.filter((p) => p.type === type).reduce((n, p) => n + phrases(p.text).filter(keyOf).length, 0);
  return { added: count("add"), removed: count("del") };
}
