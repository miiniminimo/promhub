import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { Style } from "../types";
import type { ChatFile } from "./repos";

/**
 * One chat turn. Assistant turns carry the raw JSON the model returned so it can see its
 * earlier drafts; user turns may carry attached files (resent each turn — the API is stateless).
 */
export type BuilderTurn = { role: "user" | "assistant"; content: string; files?: ChatFile[] };

export type BuilderContext = { model: string; style: Style };

export type BuilderResult = {
  reply: string;
  prompt: string;
  negativePrompt: string;
  ready: boolean;
  /** Raw assistant turn to append to the history for the next request. */
  raw: string;
  mode: "ai" | "demo";
};

const MODEL = "claude-opus-5-5";
let warnedDemo = false;

// Stable system prompt (kept byte-identical across requests so it can be cached).
const SYSTEM = `You are PromHub's prompt-building assistant. You help users write a production-quality prompt for a generative AI model through a short conversation, in Korean.

How to work:
- Each user turn starts with a bracketed context line naming the target model and visual style the user picked. Write the prompt for that model's conventions (e.g. comma-separated tags for anime SDXL/Pony/Illustrious models, natural sentences for Flux/OpenAI/Imagen, --ar style flags only for Midjourney-like models).
- Ask at most two focused questions per turn about what is still missing (subject, composition, lighting, mood, colors, camera/lens, aspect ratio, things to avoid). Don't ask about details the user already gave.
- Always return your best current draft, even early on, so the user sees progress. Write the prompt itself in English unless the user asks otherwise.
- Put things to avoid in negative_prompt (empty string if the target model doesn't use negative prompts or nothing applies).
- Set ready to true once the draft covers subject, style, composition and lighting well enough to generate.
- reply is shown to the user in a chat bubble: Korean, friendly, at most 3 short sentences. Don't repeat the full prompt in reply.

Attachments:
- Image attachments are references: describe their visual style precisely in the prompt (medium, palette, lighting, composition, lens/camera feel, texture, mood) so the target model can reproduce that style. Don't name real people.
- Text or PDF attachments are usually chat logs or notes: find the prompts the user actually used (or the requirements they describe), and consolidate them into one improved prompt. In reply, briefly say what you extracted.`;

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    prompt: { type: "string" },
    negative_prompt: { type: "string" },
    ready: { type: "boolean" },
  },
  required: ["reply", "prompt", "negative_prompt", "ready"],
  additionalProperties: false,
};

/** Message sent on the user's behalf when they attach files without typing anything. */
export const DEFAULT_FILE_MESSAGE = "첨부한 파일을 바탕으로 프롬프트를 만들어줘.";

const STYLE_LABEL: Record<Style, string> = { anime: "애니", photo: "실사", illustration: "일러스트" };

function contextLine({ model, style }: BuilderContext) {
  return `[대상 모델: ${model || "미정"} / 스타일: ${STYLE_LABEL[style]}]`;
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

function toContentBlock(file: ChatFile): Anthropic.Beta.BetaContentBlockParam {
  if ((IMAGE_TYPES as readonly string[]).includes(file.mime)) {
    return {
      type: "image",
      source: { type: "base64", media_type: file.mime as ImageType, data: file.data.toString("base64") },
    };
  }
  if (file.mime === "application/pdf") {
    return {
      type: "document",
      title: file.name,
      source: { type: "base64", media_type: "application/pdf", data: file.data.toString("base64") },
    };
  }
  return {
    type: "document",
    title: file.name,
    source: { type: "text", media_type: "text/plain", data: file.data.toString("utf8") },
  };
}

function toMessageParam(turn: BuilderTurn): Anthropic.Beta.BetaMessageParam {
  if (turn.role === "assistant" || !turn.files?.length) return { role: turn.role, content: turn.content };
  // Attachments go before the text that refers to them.
  return { role: "user", content: [...turn.files.map(toContentBlock), { type: "text", text: turn.content }] };
}

export async function buildPrompt(
  history: BuilderTurn[],
  message: string,
  files: ChatFile[],
  ctx: BuilderContext,
): Promise<BuilderResult> {
  if (process.env.PROMHUB_AI_DEMO === "1") return demoBuild(history, message, files, ctx);

  let client: Anthropic;
  try {
    client = new Anthropic();
  } catch {
    // No credentials configured at all — keep the flow usable for demos.
    return demoBuild(history, message, files, ctx);
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map(toMessageParam),
    toMessageParam({ role: "user", content: `${contextLine(ctx)}\n${message}`, files }),
  ];

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages,
      // Attachments are resent every turn; cache the conversation prefix so they're billed once.
      cache_control: { type: "ephemeral" },
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      // If a safety classifier declines, re-run on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") {
      return {
        reply: "이 요청은 도와드리기 어려워요. 다른 방향으로 설명해 주시겠어요?",
        prompt: "",
        negativePrompt: "",
        ready: false,
        raw: JSON.stringify({ reply: "refused", prompt: "", negative_prompt: "", ready: false }),
        mode: "ai",
      };
    }

    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text) as { reply: string; prompt: string; negative_prompt: string; ready: boolean };
    return {
      reply: parsed.reply,
      prompt: parsed.prompt,
      negativePrompt: parsed.negative_prompt,
      ready: parsed.ready,
      raw: text,
      mode: "ai",
    };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || !(error instanceof Anthropic.APIError)) {
      // Missing/invalid credentials (or credential resolution failed): fall back to demo mode.
      if (!warnedDemo) {
        console.warn("[prompt-builder] Claude API unavailable, using demo mode:", (error as Error).message);
        warnedDemo = true;
      }
      return demoBuild(history, message, files, ctx);
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error("요청이 많아 잠시 후 다시 시도해주세요.");
    }
    throw new Error(`AI 응답을 받지 못했어요. (${error.status ?? "network"})`);
  }
}

// ---------- Demo mode (no API credentials) ----------

const DEMO_STYLE: Record<Style, { tags: string; negative: string }> = {
  anime: {
    tags: "anime style, clean lineart, cel shading, vibrant colors, masterpiece, best quality",
    negative: "lowres, bad anatomy, extra fingers, blurry, watermark, text",
  },
  photo: {
    tags: "photorealistic, natural lighting, 50mm lens, shallow depth of field, high detail",
    negative: "cartoon, illustration, oversaturated, blurry, watermark",
  },
  illustration: {
    tags: "digital illustration, painterly, rich textures, soft lighting, detailed background",
    negative: "photo, 3d render, blurry, watermark, text",
  },
};

const DEMO_QUESTIONS = [
  "좋아요! 원하는 분위기나 조명이 있나요? (예: 노을빛, 네온, 부드러운 자연광)",
  "구도는 어떻게 할까요? 클로즈업, 전신, 풍경 중에 골라주시면 반영할게요.",
  "거의 다 됐어요. 빼고 싶은 요소가 있으면 알려주세요. 없으면 이대로 사용하셔도 돼요!",
];

/** Demo stand-in for reading an attachment: image → style note, text → its longest line. */
function demoFromFile(file: ChatFile) {
  if ((IMAGE_TYPES as readonly string[]).includes(file.mime)) return `in the visual style of the reference image "${file.name}"`;
  if (file.mime === "application/pdf") return `based on "${file.name}"`;
  const longest = file.data
    .toString("utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .sort((a, b) => b.length - a.length)[0];
  return longest ? longest.slice(0, 300) : "";
}

function demoBuild(history: BuilderTurn[], message: string, files: ChatFile[], ctx: BuilderContext): BuilderResult {
  const userTurns = [...history.filter((t) => t.role === "user"), { role: "user" as const, content: message, files }];
  const details = userTurns
    .flatMap((t) => [t.content.replace(/^\[[^\]]*\]\n/, ""), ...(t.files ?? []).map(demoFromFile)])
    .map((s) => s.trim())
    .filter((s) => s && s !== DEFAULT_FILE_MESSAGE);
  const style = DEMO_STYLE[ctx.style];
  const turn = userTurns.length - 1;

  const prompt = `${details.join(", ")}, ${style.tags}`;
  const ready = turn >= 2;
  const result = {
    reply: `[데모 모드] ${DEMO_QUESTIONS[Math.min(turn, DEMO_QUESTIONS.length - 1)]}`,
    prompt,
    negative_prompt: style.negative,
    ready,
  };
  return {
    reply: result.reply,
    prompt,
    negativePrompt: style.negative,
    ready,
    raw: JSON.stringify(result),
    mode: "demo",
  };
}
