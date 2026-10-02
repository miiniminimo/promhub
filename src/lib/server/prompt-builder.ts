import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { betaTool } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { AGENTS } from "../agents";
import { SAFE_IMAGE_TYPES } from "../image-types";
import { joinNegative, usesNegativePrompt } from "../prompt-format";
import { styleOf } from "../styles";
import type { Style } from "../types";
import type { ChatFile } from "./repos";
import { popularInStyle, searchPromHub } from "./search";

/**
 * One chat turn. Assistant turns carry the raw JSON the agent returned so it can see its
 * earlier drafts; user turns may carry attached files (resent each turn — the API is stateless).
 */
export type BuilderTurn = { role: "user" | "assistant"; content: string; files?: ChatFile[] };

export type BuilderContext = { model: string; style: Style };

export type Reference = { title: string; url: string };

export type BuilderResult = {
  agent: Style;
  reply: string;
  prompt: string;
  ready: boolean;
  /** Suggested repo title / target model — the form fills them in only if still empty. */
  title: string;
  model: string;
  references: Reference[];
  /** Raw assistant turn to append to the history for the next request. */
  raw: string;
  mode: "ai" | "demo";
};

const MODEL = "claude-opus-5-5";
let warnedDemo = false;

/** Message sent on the user's behalf when they attach files without typing anything. */
export const DEFAULT_FILE_MESSAGE = "첨부한 파일을 바탕으로 프롬프트를 만들어줘.";

// ---------- Agents ----------

const BASE_SYSTEM = `You are a prompt-building agent inside PromHub, a service where people version-control prompts for generative AI. Through a short conversation in Korean you help the user write one production-quality prompt, then they save it as a repository.

How to work:
- Each user turn starts with a bracketed context line naming the target model the user picked (may be empty) and the visual style.
- Ask at most two focused questions per turn about what is still missing. Don't ask about details the user already gave.
- Always return your best current draft, even early on, so the user sees progress. Write the prompt in English unless the user asks otherwise.
- The draft is a single text. If the target model is a Stable Diffusion-family model (SDXL, SD 1.5, Pony, Illustrious, NoobAI, Animagine…), end it with one line "Negative prompt: …" listing things to avoid. For models that don't take negative prompts (Flux, OpenAI/GPT Image, Imagen, Midjourney…), put any "avoid" instructions inside the prompt itself and add no Negative prompt line.
- When starting a new idea, or when the user asks for references, call search_promhub with short English keywords. Mention genuinely useful hits in references (use their url exactly as returned) and borrow techniques from them, but never copy a prompt wholesale.
- title: a short repository title (Korean or English, ≤ 40 chars) describing the result. model: the target model to use — keep the user's choice if they gave one, otherwise recommend one.
- Set ready to true once the draft covers subject, style, composition and lighting well enough to generate.
- reply is shown in a chat bubble: Korean, friendly, at most 3 short sentences. Don't repeat the full prompt in reply.

Attachments:
- Image attachments are references: describe their visual style precisely in the prompt so the target model can reproduce it. Don't name real people.
- Text or PDF attachments are usually chat logs or notes: find the prompts the user actually used (or the requirements they describe) and consolidate them into one improved prompt. Say briefly in reply what you extracted.`;

const AGENT_SYSTEM: Record<Style, string> = {
  anime: `You are the ANIME agent: an expert in anime / manga character art.
- For Stable Diffusion anime models write comma-separated booru-style tags, ordered: quality tags → subject count (1girl, 1boy…) → character features (hair, eyes, expression) → outfit → pose/action → background → lighting/effects. Use (tag:1.2) weights sparingly.
- Quality tags by model: Pony → start with "score_9, score_8_up, score_7_up"; Illustrious / NoobAI → "masterpiece, best quality, amazing quality, very aesthetic, absurdres, newest".
- Typical negative line: lowres, bad anatomy, bad hands, extra fingers, missing fingers, blurry, jpeg artifacts, watermark, signature, text.
- For natural-language models describe the scene in sentences and state the anime art style (cel shading, clean lineart, key-visual look).
- Ask about: character design, outfit, pose and expression, background, art style (key visual, chibi, 90s cel…).
- Default model if the user has none: ${AGENTS.anime.defaultModel}.`,
  photo: `You are the PHOTO agent: an expert in photorealistic images and photography.
- Think like a photographer: subject and action, environment, time of day and weather, light source and quality (golden hour, softbox, rim light, neon), camera and lens (e.g. 35mm / 85mm, f/1.8), depth of field, composition and angle, film stock or color grade.
- For Flux / Imagen / OpenAI write natural descriptive sentences. For SDXL photoreal models use dense comma phrases and add a negative line like: cartoon, illustration, painting, 3d render, cgi, plastic skin, oversaturated, blurry, watermark, text.
- Never describe or name real, identifiable people; describe generic people only.
- Ask about: lighting, lens/framing, mood, location details, aspect ratio.
- Default model if the user has none: ${AGENTS.photo.defaultModel}.`,
  illustration: `You are the ILLUSTRATION agent: an expert in illustration and fine-art styles.
- Specify the medium and technique (watercolor wash, gouache, ink linework, digital painting, vector flat, risograph print, linocut…), palette, line quality, texture (paper grain, brush strokes), composition and mood.
- Don't imitate living artists by name — describe the style traits instead. Historical movements (Art Nouveau, ukiyo-e, Bauhaus poster) are fine.
- For SD-family models use comma phrases plus a negative line such as: photo, photorealistic, 3d render, blurry, muddy colors, watermark, text.
- Ask about: medium, palette, level of detail, intended use (poster, book cover, sticker).
- Default model if the user has none: ${AGENTS.illustration.defaultModel}.`,
};

const str = { type: "string" };
const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    reply: str,
    prompt: str,
    ready: { type: "boolean" },
    title: str,
    model: str,
    references: {
      type: "array",
      items: { type: "object", properties: { title: str, url: str }, required: ["title", "url"], additionalProperties: false },
    },
  },
  required: ["reply", "prompt", "ready", "title", "model", "references"],
  additionalProperties: false,
};

type AgentOutput = Omit<BuilderResult, "agent" | "raw" | "mode">;

const REFUSED: AgentOutput = {
  reply: "이 요청은 도와드리기 어려워요. 다른 방향으로 설명해 주시겠어요?",
  prompt: "",
  ready: false,
  title: "",
  model: "",
  references: [],
};

const result = (output: AgentOutput, ctx: BuilderContext, mode: BuilderResult["mode"]): BuilderResult => ({
  ...output,
  agent: ctx.style,
  raw: JSON.stringify(output),
  mode,
});

const contextLine = ({ model, style }: BuilderContext) => `[대상 모델: ${model || "미정"} / 스타일: ${styleOf(style).label}]`;

const isImage = (file: ChatFile) => SAFE_IMAGE_TYPES.includes(file.mime);

// ---------- Content blocks ----------

type ImageType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function toContentBlock(file: ChatFile): Anthropic.Beta.BetaContentBlockParam {
  if (isImage(file)) {
    return { type: "image", source: { type: "base64", media_type: file.mime as ImageType, data: file.data.toString("base64") } };
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

// ---------- Entry point ----------

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

  const searchTool = betaTool({
    name: "search_promhub",
    description:
      "Search PromHub's public prompts (community posts and users' public repositories) for references similar to the user's idea. Returns up to 5 hits with title, author, model, style, url and the prompt text. Use short English keywords.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Short English keywords, e.g. 'neon rain street cat'" },
        same_style_only: { type: "boolean", description: "Only return results in the current style" },
      },
      required: ["query"],
      additionalProperties: false,
    },
    run: async ({ query, same_style_only }) => {
      const hits = searchPromHub(query, same_style_only === false ? null : ctx.style);
      return hits.length ? JSON.stringify(hits) : "No matching prompts found.";
    },
  });

  try {
    // The SDK's tool runner drives the agent loop (search → draft) and returns the final message.
    const response = await client.beta.messages.toolRunner({
      model: MODEL,
      max_tokens: 16000,
      max_iterations: 4,
      system: [
        { type: "text", text: BASE_SYSTEM },
        // Per-agent instructions; each agent's system prefix is cached separately.
        { type: "text", text: AGENT_SYSTEM[ctx.style], cache_control: { type: "ephemeral" } },
      ],
      tools: [searchTool],
      messages: [
        ...history.map(toMessageParam),
        toMessageParam({ role: "user", content: `${contextLine(ctx)}\n${message}`, files }),
      ],
      // Attachments are resent every turn; cache the conversation prefix so they're billed once.
      cache_control: { type: "ephemeral" },
      output_config: { effort: "low", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      // If a safety classifier declines, re-run on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") return result(REFUSED, ctx, "ai");

    const text = response.content.find((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text) as AgentOutput;
    // Only keep links that point inside PromHub.
    parsed.references = parsed.references.filter((r) => /^\/(p|repos)\/[\w-]+$/.test(r.url));
    return { ...result(parsed, ctx, "ai"), raw: text };
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

const DEMO: Record<Style, { tags: string; negative: string; questions: string[] }> = {
  anime: {
    tags: "masterpiece, best quality, anime style, clean lineart, cel shading, vibrant colors",
    negative: "lowres, bad anatomy, bad hands, extra fingers, blurry, watermark, text",
    questions: [
      "좋아요! 캐릭터의 머리색·표정·의상을 알려주시면 태그로 정리할게요.",
      "포즈와 배경은 어떻게 할까요? (예: 뒤돌아보기, 교실, 벚꽃길)",
      "거의 다 됐어요. 그림체(키비주얼, 90년대 셀화 등)를 정하면 마무리할게요!",
    ],
  },
  photo: {
    tags: "photorealistic, natural light, 50mm lens, f/1.8, shallow depth of field, high detail",
    negative: "cartoon, illustration, 3d render, plastic skin, oversaturated, blurry, watermark",
    questions: [
      "좋아요! 조명은 어떤 느낌일까요? (골든아워, 네온, 스튜디오 소프트박스 등)",
      "렌즈나 구도 취향이 있나요? (광각 풍경, 85mm 인물, 매크로 등)",
      "거의 다 됐어요. 화면 비율이나 분위기를 정하면 마무리할게요!",
    ],
  },
  illustration: {
    tags: "digital illustration, painterly brush strokes, rich textures, soft lighting, detailed background",
    negative: "photo, photorealistic, 3d render, blurry, muddy colors, watermark",
    questions: [
      "좋아요! 어떤 재료 느낌이 좋을까요? (수채화, 과슈, 잉크, 리소 인쇄 등)",
      "색감은 어떻게 할까요? (파스텔, 비비드, 2도 인쇄 등)",
      "거의 다 됐어요. 용도(포스터, 표지, 스티커)를 알려주면 마무리할게요!",
    ],
  },
};

/** Demo stand-in for reading an attachment: image → style note, text → its longest line. */
function demoFromFile(file: ChatFile) {
  if (isImage(file)) return `in the visual style of the reference image "${file.name}"`;
  if (file.mime === "application/pdf") return `based on "${file.name}"`;
  const longest = file.data
    .toString("utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .sort((a, b) => b.length - a.length)[0];
  return longest ? longest.slice(0, 300) : "";
}

function demoBuild(history: BuilderTurn[], message: string, files: ChatFile[], ctx: BuilderContext): BuilderResult {
  const demo = DEMO[ctx.style];
  const agent = AGENTS[ctx.style];
  const userTurns = [...history.filter((t) => t.role === "user"), { role: "user" as const, content: message, files }];
  const details = userTurns
    .flatMap((t) => [t.content.replace(/^\[[^\]]*\]\n/, ""), ...(t.files ?? []).map(demoFromFile)])
    .map((s) => s.trim())
    .filter((s) => s && s !== DEFAULT_FILE_MESSAGE);
  const turn = userTurns.length - 1;
  const model = ctx.model || agent.defaultModel;

  // Mimic the agent's search step: keyword hits, else popular posts in this style (first turn only).
  const hits = turn === 0 ? searchPromHub(details.join(" "), ctx.style, 2) : [];
  const references = (hits.length ? hits : turn === 0 ? popularInStyle(ctx.style, 2) : []).map((h) => ({
    title: h.title,
    url: h.url,
  }));

  const body = `${details.join(", ")}, ${demo.tags}`;
  return result(
    {
      reply: `[데모 모드 · ${agent.name}] ${demo.questions[Math.min(turn, demo.questions.length - 1)]}`,
      prompt: usesNegativePrompt(model) ? joinNegative(body, demo.negative) : body,
      ready: turn >= 2,
      title: (details[0] ?? "").slice(0, 40),
      model,
      references,
    },
    ctx,
    "demo",
  );
}
