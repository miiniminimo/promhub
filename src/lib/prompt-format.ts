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
// model gets the style spelled out, SD-only syntax removed and the negative line rephrased.
const STYLE_HINT: Record<Style, string> = {
  anime: "High-quality anime illustration with clean lineart and polished cel shading.",
  photo: "High-quality photorealistic photograph.",
  illustration: "High-quality illustration.",
};

/** Stable Diffusion quality/booru boilerplate that means nothing to GPT image models. */
const SD_BOILERPLATE =
  /^(score_\d+(_up)?|masterpiece|best quality|amazing quality|high quality|very aesthetic|absurdres|highres|newest|ultra[- ]detailed|8k|4k|uhd|source_\w+|rating_\w+|break)$/i;

/** Drops SD-only syntax from a comma-separated prompt: LoRA tags, (weights:1.2), quality boilerplate. */
export function cleanForPreview(text: string) {
  return text
    .replace(/<lora:[^>]*>/gi, "")
    .replace(/\(([^():]+):[\d.]+\)/g, "$1")
    .replace(/[()[\]]/g, "")
    .split(",")
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part && !SD_BOILERPLATE.test(part))
    .join(", ");
}

/** The text sent to the OpenAI image model for a chat draft. */
export function previewPrompt(draft: string, style: Style) {
  const { prompt, negative } = splitNegative(draft);
  const avoid = negative && cleanForPreview(negative);
  return [STYLE_HINT[style], cleanForPreview(prompt), avoid && `Avoid: ${avoid}.`].filter(Boolean).join("\n");
}
