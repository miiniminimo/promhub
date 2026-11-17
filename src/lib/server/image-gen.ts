import "server-only";

import OpenAI from "openai";
import { previewPrompt } from "../prompt-format";
import type { Style } from "../types";

/** OpenAI image model and quality for previews; `OPENAI_IMAGE_MODEL` / `OPENAI_IMAGE_QUALITY` override them. */
export const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
const QUALITIES = ["low", "medium", "high", "xhigh", "max", "auto"] as const;
type Quality = (typeof QUALITIES)[number];
const envQuality = process.env.OPENAI_IMAGE_QUALITY as Quality | undefined;
const QUALITY: Quality = envQuality && QUALITIES.includes(envQuality) ? envQuality : "high";
const SIZE = { width: 1024, height: 1024 };

/** Previews need a real API key (they have no offline fallback). */
export const previewAvailable = () => process.env.PROMHUB_AI_DEMO !== "1" && !!process.env.OPENAI_API_KEY;

export type GeneratedImage = { data: Buffer; mime: string; width: number; height: number; model: string };

/** Renders a draft with the OpenAI image model. Throws an Error with a user-facing message. */
export async function generatePreview(draft: string, style: Style): Promise<GeneratedImage> {
  if (!previewAvailable()) throw new Error("이미지 미리보기는 OpenAI API 키가 있어야 사용할 수 있어요.");
  try {
    const response = await new OpenAI().images.generate({
      model: IMAGE_MODEL,
      prompt: previewPrompt(draft, style),
      size: `${SIZE.width}x${SIZE.height}`,
      quality: QUALITY,
      output_format: "webp",
      n: 1,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("이미지를 받지 못했어요. 다시 시도해주세요.");
    return { data: Buffer.from(b64, "base64"), mime: "image/webp", ...SIZE, model: IMAGE_MODEL };
  } catch (error) {
    if (error instanceof OpenAI.APIError) {
      console.warn("[image-gen]", error.status, error.code, error.message);
      if (error.code === "moderation_blocked" || /safety|moderation/i.test(error.message)) {
        throw new Error("안전 정책 때문에 이 프롬프트로는 이미지를 만들 수 없어요. 표현을 바꿔서 다시 시도해주세요.");
      }
      if (error instanceof OpenAI.RateLimitError) throw new Error("이미지 요청이 많아 잠시 후 다시 시도해주세요.");
      if (/missing scopes|insufficient permissions/i.test(error.message)) {
        // A restricted key without the Images permission (chat still works with it).
        throw new Error("OpenAI API 키에 이미지 생성 권한이 없어요. OpenAI 대시보드에서 키의 Images 권한을 켜주세요.");
      }
      if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
        throw new Error("OpenAI API 키로 이미지를 만들 수 없어요. 키를 확인해주세요.");
      }
      throw new Error(`이미지를 만들지 못했어요. (${error.status ?? "network"})`);
    }
    throw error;
  }
}
