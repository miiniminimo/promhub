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
