import type { Style } from "./types";

// One prompt text per version. Things to avoid go on a trailing "Negative prompt:" line —
// the A1111 / Civitai convention, which Stable Diffusion UIs split back into two fields on paste.

const NEGATIVE_LINE = "Negative prompt:";

export function joinNegative(prompt: string, negative: string | null | undefined) {
  const neg = negative?.trim();
  return neg ? `${prompt.trim()}\n${NEGATIVE_LINE} ${neg}` : prompt.trim();
}

/** Base models whose UIs take a separate negative prompt (Stable Diffusion family). */
export function usesNegativePrompt(model: string) {
  return /sdxl|sd ?1\.5|sd ?2|stable ?diffusion|pony|illustrious|noob|anima|animagine/i.test(model);
}

/** Inverse of joinNegative: the prompt body and its "Negative prompt:" line (if any). */
export function splitNegative(text: string): { prompt: string; negative: string | null } {
  const i = text.lastIndexOf(`\n${NEGATIVE_LINE}`);
  const start = text.startsWith(NEGATIVE_LINE) ? 0 : i === -1 ? -1 : i + 1;
  if (start === -1) return { prompt: text.trim(), negative: null };
  return {
    prompt: text.slice(0, start).trim(),
    negative: text.slice(start + NEGATIVE_LINE.length).trim() || null,
  };
}

// Drafts are written for the user's target model (often Stable Diffusion tags), so the preview
// model gets the style spelled out and the negative line rephrased as an instruction.
const STYLE_HINT: Record<Style, string> = {
  anime: "Anime illustration (cel shading, clean lineart).",
  photo: "Photorealistic photograph.",
  illustration: "Illustration.",
};

/** The text sent to the OpenAI image model for a chat draft. */
export function previewPrompt(draft: string, style: Style) {
  const { prompt, negative } = splitNegative(draft);
  return [STYLE_HINT[style], prompt, negative && `Avoid: ${negative}.`].filter(Boolean).join("\n");
}
