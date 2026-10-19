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

// ---------- Offline mode (no API credentials) ----------
// Answers like the agent without calling the API: the example ideas offered in the chat have
// hand-written drafts, and anything else is mapped to English through a keyword table so the
// draft never carries raw Korean.

const OFFLINE: Record<Style, { subject: string; tags: string; negative: string; questions: string[] }> = {
  anime: {
    subject: "1girl, original character, upper body",
    tags: "masterpiece, best quality, anime style, clean lineart, cel shading, vibrant colors",
    negative: "lowres, bad anatomy, bad hands, extra fingers, blurry, watermark, text",
    questions: [
      "좋아요! 캐릭터의 머리색·표정·의상을 알려주시면 태그로 정리할게요.",
      "포즈와 배경은 어떻게 할까요? (예: 뒤돌아보기, 교실, 벚꽃길)",
    ],
  },
  photo: {
    subject: "A cinematic photograph",
    tags: "photorealistic, natural light, 50mm lens, f/1.8, shallow depth of field, high detail",
    negative: "cartoon, illustration, 3d render, plastic skin, oversaturated, blurry, watermark",
    questions: [
      "좋아요! 조명은 어떤 느낌일까요? (골든아워, 네온, 스튜디오 소프트박스 등)",
      "렌즈나 구도 취향이 있나요? (광각 풍경, 85mm 인물, 매크로 등)",
    ],
  },
  illustration: {
    subject: "An illustration",
    tags: "digital illustration, painterly brush strokes, rich textures, soft lighting, detailed background",
    negative: "photo, photorealistic, 3d render, blurry, muddy colors, watermark",
    questions: [
      "좋아요! 어떤 재료 느낌이 좋을까요? (수채화, 과슈, 잉크, 리소 인쇄 등)",
      "색감은 어떻게 할까요? (파스텔, 비비드, 2도 인쇄 등)",
    ],
  },
};

/** Hand-written drafts for the example ideas shown in the empty chat (lib/agents.ts). */
const SCRIPTS: Record<string, { subject: string; title: string; search: string }> = {
  "벚꽃 아래 교복 입은 소녀, 바람에 머리카락 날림": {
    subject: "1girl, school uniform, standing under cherry blossom trees, wind, floating hair, falling petals",
    title: "벚꽃 아래 교복 소녀",
    search: "girl school uniform cherry blossom",
  },
  "사이버펑크 도시의 여우 귀 해커 캐릭터": {
    subject: "1girl, fox ears, hacker, oversized hoodie, holographic screens, cyberpunk city at night, neon lights",
    title: "사이버펑크 여우 귀 해커",
    search: "cyberpunk fox ears neon",
  },
  "비 오는 밤 네온사인 거리의 우산 쓴 사람": {
    subject: "A person holding a transparent umbrella on a rainy street at night, neon signs reflecting on the wet pavement",
    title: "비 오는 밤 네온 거리",
    search: "rain night neon street umbrella",
  },
  "젖은 콘크리트 위 무선 이어폰 제품 사진": {
    subject: "Product photo of a matte black wireless earbud case resting on wet concrete, water droplets around it",
    title: "젖은 콘크리트 위 이어폰",
    search: "product photo earbud concrete",
  },
  "수채화로 그린 창가의 고양이, 노을빛": {
    subject: "A watercolor illustration of a cat sitting on a windowsill at sunset, warm orange light through the window",
    title: "노을빛 창가의 고양이",
    search: "watercolor cat window sunset",
  },
  "리소 인쇄 느낌의 여름 바다 포스터": {
    subject: "A risograph-style summer beach poster with bold waves and a small sailboat, grainy two-color print texture",
    title: "리소 인쇄 여름 바다 포스터",
    search: "risograph poster sea summer",
  },
};

const KEYWORDS: [RegExp, string][] = [
  [/노을|석양|골든\s?아워/, "golden hour sunset light"],
  [/역광/, "backlighting"],
  [/네온/, "neon lights"],
  [/비\s?오는|빗|우천/, "rain"],
  [/밤|야경/, "at night"],
  [/아침|새벽/, "soft early morning light"],
  [/뒷모습|뒤돌아/, "seen from behind, looking back"],
  [/정면/, "front view"],
  [/클로즈업|얼굴/, "close-up"],
  [/전신/, "full body"],
  [/미소|웃는|웃음/, "gentle smile"],
  [/슬픈|눈물/, "melancholic expression"],
  [/은발|은색 머리/, "silver hair"],
  [/금발/, "blonde hair"],
  [/흑발|검은 머리/, "black hair"],
  [/갈색 머리|갈발/, "brown hair"],
  [/분홍 머리|핑크 머리/, "pink hair"],
  [/단발|짧은 머리/, "short hair"],
  [/장발|긴 머리/, "long hair"],
  [/트윈테일/, "twintails"],
  [/포니테일/, "ponytail"],
  [/파란 눈|푸른 눈/, "blue eyes"],
  [/빨간 눈|붉은 눈/, "red eyes"],
  [/안경/, "glasses"],
  [/후드/, "hoodie"],
  [/원피스|드레스/, "dress"],
  [/정장|수트/, "suit"],
  [/기모노|한복/, "traditional clothing"],
  [/교실/, "classroom"],
  [/벚꽃/, "cherry blossoms"],
  [/바다|해변/, "ocean beach"],
  [/숲/, "forest"],
  [/도시|거리|골목/, "city street"],
  [/카페/, "cozy cafe"],
  [/고양이/, "cat"],
  [/강아지/, "dog"],
  [/소녀|여자/, "girl"],
  [/소년|남자/, "boy"],
  [/수채화/, "watercolor"],
  [/유화/, "oil painting"],
  [/잉크|펜화/, "ink linework"],
  [/과슈/, "gouache"],
  [/리소/, "risograph print texture"],
  [/파스텔/, "pastel palette"],
  [/비비드|선명/, "vivid saturated colors"],
  [/흑백|모노/, "monochrome"],
  [/따뜻/, "warm color palette"],
  [/차가운|시원/, "cool blue tones"],
  [/몽환|꿈/, "dreamy atmosphere"],
  [/시네마틱|영화/, "cinematic"],
  [/85\s?mm/, "85mm lens"],
  [/35\s?mm/, "35mm lens"],
  [/광각/, "wide-angle lens"],
  [/매크로|접사/, "macro lens"],
  [/심도|아웃포커스|보케/, "shallow depth of field, bokeh"],
  [/키비주얼/, "key visual composition"],
  [/90년대|셀화/, "90s cel animation style"],
  [/치비/, "chibi"],
  [/세로|9:16/, "vertical 9:16 framing"],
  [/가로|16:9/, "wide 16:9 framing"],
  [/포스터/, "poster layout"],
  [/표지/, "book cover layout"],
  [/스티커/, "die-cut sticker style"],
];

/** English phrases for the keywords found in Korean input (input already in English passes through). */
function toEnglish(text: string): string[] {
  const clean = text.replace(/^\[[^\]]*\]\n/, "").trim();
  if (!clean || clean === DEFAULT_FILE_MESSAGE) return [];
  if (!/[가-힣]/.test(clean)) return [clean.slice(0, 300)];
  return KEYWORDS.filter(([pattern]) => pattern.test(clean)).map(([, english]) => english);
}

function fileNotes(file: ChatFile): string[] {
  if (isImage(file)) return ["matching the style, palette and composition of the reference image"];
  if (file.mime === "application/pdf") return [];
  const longest = file.data
    .toString("utf8")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(user|assistant|human|ai)\s*:\s*/i, "").trim())
    .sort((a, b) => b.length - a.length)[0];
  return longest ? toEnglish(longest) : [];
}

function demoBuild(history: BuilderTurn[], message: string, files: ChatFile[], ctx: BuilderContext): BuilderResult {
  const style = OFFLINE[ctx.style];
  const model = ctx.model || AGENTS[ctx.style].defaultModel;
  const userTurns = [...history.filter((t) => t.role === "user"), { role: "user" as const, content: message, files }];
  const turn = userTurns.length - 1;
  const first = userTurns[0].content.replace(/^\[[^\]]*\]\n/, "").trim();
  const script = SCRIPTS[first];

  const phrases = [
    ...(script ? [script.subject] : toEnglish(first)),
    ...userTurns.slice(1).flatMap((t) => toEnglish(t.content)),
    ...userTurns.flatMap((t) => (t.files ?? []).flatMap(fileNotes)),
  ];
  const unique = [...new Set(phrases)];
  const body = [unique.length ? unique.join(", ") : style.subject, style.tags].join(", ");

  // Mimic the agent's search step on the first turn: keyword hits, else popular posts in this style.
  const hits = turn === 0 ? searchPromHub(script?.search ?? unique.join(" "), ctx.style, 2) : [];
  const references = (hits.length ? hits : turn === 0 ? popularInStyle(ctx.style, 2) : []).map((h) => ({
    title: h.title,
    url: h.url,
  }));

  const ready = turn >= 2;
  const reply = ready
    ? "완성됐어요! 오른쪽 초안을 확인하고 저장소를 만들면 돼요. 더 바꾸고 싶은 부분이 있으면 말씀해 주세요."
    : `${turn > 0 ? "반영했어요. " : ""}${style.questions.at(turn)}`;
  return result(
    {
      reply,
      prompt: usesNegativePrompt(model) ? joinNegative(body, style.negative) : body,
      ready,
      title: script?.title ?? first.slice(0, 40),
      model,
      references,
    },
    ctx,
    "demo",
  );
}
