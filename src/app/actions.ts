"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getChallenge, grade, scoreOf, type TestResult } from "@/lib/challenges";
import { SAFE_IMAGE_TYPES } from "@/lib/image-types";
import { getPost } from "@/lib/posts";
import { safeNextPath } from "@/lib/safe-redirect";
import { STYLES } from "@/lib/styles";
import { createSession, destroySession, getCurrentUser, hashPassword, requireUser, verifyPassword } from "@/lib/server/auth";
import { sql } from "@/lib/server/db";
import {
  addCommit,
  createRepo,
  forkPost,
  forkRepo,
  getChatFiles,
  getCommits,
  getRepo,
  imageOwner,
  type RepoSource,
  saveChatFile,
  saveImage,
  setVisibility,
  slugify,
} from "@/lib/server/repos";
import { buildPrompt, type BuilderContext, type BuilderResult, DEFAULT_FILE_MESSAGE } from "@/lib/server/prompt-builder";
import { saveSubmission } from "@/lib/server/submissions";
import type { Style } from "@/lib/types";

export type FormState = { error?: string; username?: string } | undefined;

const USERNAME = /^[a-z0-9_]{3,20}$/;

// ---------- Auth ----------

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!USERNAME.test(username)) return { error: "아이디는 영문 소문자·숫자·_ 3~20자로 입력해주세요.", username };
  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 합니다.", username };
  if (password !== formData.get("passwordConfirm")) return { error: "비밀번호가 일치하지 않습니다.", username };

  const exists = sql("SELECT 1 FROM users WHERE username = ?").get(username);
  if (exists) return { error: "이미 사용 중인 아이디입니다.", username };

  const { lastInsertRowid } = sql("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, hashPassword(password));
  await createSession(Number(lastInsertRowid));
  redirect(safeNextPath(formData.get("next")));
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = sql("SELECT id, password_hash FROM users WHERE username = ?").get(username) as
    | { id: number; password_hash: string }
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다.", username };
  }
  await createSession(user.id);
  redirect(safeNextPath(formData.get("next")));
}

export async function logout() {
  await destroySession();
  redirect("/");
}

// ---------- Repos ----------

export async function forkPostAction(postId: string) {
  const user = await requireUser(`/p/${postId}`);
  const post = getPost(postId);
  if (!post) throw new Error("Post not found");
  redirect(`/repos/${forkPost(user.id, post)}`);
}

export async function forkRepoAction(repoId: number) {
  const user = await requireUser(`/repos/${repoId}`);
  const source = getRepo(repoId, user.id);
  if (!source) throw new Error("Repo not found");
  redirect(`/repos/${forkRepo(user.id, source)}`);
}

async function ownedRepo(repoId: number) {
  const user = await requireUser(`/repos/${repoId}`);
  const repo = getRepo(repoId, user.id);
  if (!repo || repo.ownerId !== user.id) throw new Error("Not your repo");
  return repo;
}

/** Form submissions send CRLF line breaks; store prompts with plain LF so versions compare cleanly. */
const normalizePrompt = (value: FormDataEntryValue | null) => String(value ?? "").replace(/\r\n?/g, "\n").trim();

export async function commitAction(_: FormState, formData: FormData): Promise<FormState> {
  const repoId = Number(formData.get("repoId"));
  if (!Number.isInteger(repoId)) return { error: "잘못된 요청입니다." };
  await ownedRepo(repoId);
  const prompt = normalizePrompt(formData.get("prompt"));
  if (!prompt) return { error: "프롬프트를 입력해주세요." };
  if (prompt === getCommits(repoId).at(-1)?.prompt.replace(/\r\n?/g, "\n").trim()) {
    return { error: "이전 버전과 달라진 내용이 없습니다." };
  }

  addCommit(repoId, {
    message: String(formData.get("message") ?? "").trim() || "Update prompt",
    prompt,
  });
  redirect(`/repos/${repoId}`);
}

export async function toggleVisibilityAction(repoId: number) {
  const repo = await ownedRepo(repoId);
  setVisibility(repoId, repo.visibility === "public" ? "private" : "public");
  revalidatePath("/", "layout");
}

const isStyle = (value: string): value is Style => STYLES.some((s) => s.value === value);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Validates and stores an uploaded image; returns its id, or an error message. */
async function storeImage(ownerId: number, file: File): Promise<number | string> {
  if (!SAFE_IMAGE_TYPES.includes(file.type)) return "JPG·PNG·GIF·WEBP 이미지만 올릴 수 있습니다.";
  if (file.size > MAX_IMAGE_BYTES) return "이미지는 5MB 이하만 올릴 수 있습니다.";
  return saveImage(ownerId, file.type, Buffer.from(await file.arrayBuffer()));
}

export async function createRepoAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/new");
  const title = String(formData.get("title") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const style = String(formData.get("style"));
  const prompt = normalizePrompt(formData.get("prompt"));
  const visibility = formData.get("visibility") === "private" ? "private" : "public";
  if (!title || !model) return { error: "제목과 사용 모델은 필수입니다." };
  if (!prompt) return { error: "AI와 대화해서 프롬프트를 먼저 만들어주세요." };
  if (!isStyle(style)) return { error: "스타일을 선택해주세요." };

  let cover = null;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    const imageId = await storeImage(user.id, file);
    if (typeof imageId === "string") return { error: imageId };
    cover = {
      src: `/api/images/${imageId}`,
      width: Number(formData.get("imageWidth")) || 1024,
      height: Number(formData.get("imageHeight")) || 1024,
    };
  }

  const sources = parseSources(formData.getAll("sources"), user.id);
  if (typeof sources === "string") return { error: sources };

  const repoId = createRepo({
    ownerId: user.id,
    name: slugify(title),
    description: title,
    model,
    style,
    cover,
    visibility,
    prompt,
    message: "Initial commit",
    sources,
  });
  redirect(`/repos/${repoId}`);
}

const MAX_SOURCES = 4;
const UPLOADED_IMAGE = /^\/api\/images\/(\d+)$/;

/** Validates the New Prompt form's source-image entries; returns an error message on failure. */
function parseSources(values: FormDataEntryValue[], ownerId: number): RepoSource[] | string {
  if (values.length > MAX_SOURCES) return `소스 이미지는 최대 ${MAX_SOURCES}개까지 추가할 수 있습니다.`;
  const sources: RepoSource[] = [];
  for (const value of values) {
    const src = String(value).trim();
    const uploaded = src.match(UPLOADED_IMAGE);
    if (uploaded) {
      if (imageOwner(Number(uploaded[1])) !== ownerId) return "소스 이미지를 찾을 수 없습니다.";
      sources.push({ src, link: null });
      continue;
    }
    try {
      const url = new URL(src);
      if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      sources.push({ src: url.toString(), link: url.toString() });
    } catch {
      return "소스 이미지 링크는 http(s) 주소여야 합니다.";
    }
  }
  return sources;
}

/** Uploads one source image for the New Prompt form; the returned `src` is submitted with the form. */
export async function uploadSourceImageAction(
  formData: FormData,
): Promise<{ ok: true; src: string } | { ok: false; error: string }> {
  const user = await requireUser("/new");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "파일을 선택해주세요." };
  const id = await storeImage(user.id, file);
  return typeof id === "string" ? { ok: false, error: id } : { ok: true, src: `/api/images/${id}` };
}

// ---------- Prompt tests ----------

export type TestRunResult = { results: TestResult[]; score: number; submitted: boolean };

export async function runTestAction(slug: string, prompt: string, submit: boolean): Promise<TestRunResult> {
  const challenge = getChallenge(slug);
  if (!challenge) throw new Error("Unknown challenge");
  const results = grade(prompt, challenge.tests);
  const score = scoreOf(results);

  const user = submit ? await getCurrentUser() : null;
  if (user) {
    saveSubmission(user.id, slug, prompt, score);
    revalidatePath("/tests");
    revalidatePath("/me");
  }
  return { results, score, submitted: !!user };
}

// ---------- AI prompt builder ----------

export type ChatFileInfo = { id: number; name: string; mime: string };

const CHAT_TEXT_EXT = /\.(txt|md|markdown|json|csv|log|html?)$/i;
const MAX_CHAT_FILE_BYTES = 10 * 1024 * 1024;

/** Stores a file attached in the prompt-builder chat; later turns refer to it by id. */
export async function uploadChatFileAction(
  formData: FormData,
): Promise<{ ok: true; file: ChatFileInfo } | { ok: false; error: string }> {
  const user = await requireUser("/new");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "파일을 선택해주세요." };
  if (file.size > MAX_CHAT_FILE_BYTES) return { ok: false, error: `${file.name}: 10MB 이하만 올릴 수 있습니다.` };

  let mime = file.type;
  if (SAFE_IMAGE_TYPES.includes(mime) || mime === "application/pdf") {
    // supported as-is
  } else if (mime.startsWith("text/") || CHAT_TEXT_EXT.test(file.name)) {
    mime = "text/plain";
  } else {
    return { ok: false, error: `${file.name}: 이미지(JPG·PNG·GIF·WEBP), 텍스트, PDF 파일만 올릴 수 있습니다.` };
  }
  const id = saveChatFile(user.id, file.name, mime, Buffer.from(await file.arrayBuffer()));
  return { ok: true, file: { id, name: file.name, mime } };
}

export type ChatTurnInput = { role: "user" | "assistant"; content: string; fileIds?: number[] };

const MAX_FILES_PER_TURN = 5;

export async function chatPromptBuilder(
  history: ChatTurnInput[],
  message: string,
  fileIds: number[],
  context: BuilderContext,
): Promise<{ ok: true; result: BuilderResult } | { ok: false; error: string }> {
  const user = await requireUser("/new");
  if (!message.trim() && fileIds.length === 0) return { ok: false, error: "메시지를 입력하거나 파일을 첨부해주세요." };
  if (fileIds.length > MAX_FILES_PER_TURN) return { ok: false, error: `한 번에 최대 ${MAX_FILES_PER_TURN}개까지 첨부할 수 있습니다.` };
  if (!isStyle(context.style)) return { ok: false, error: "스타일을 선택해주세요." };

  // Only this user's own files are ever loaded, whatever ids the client sends.
  const turns = history.slice(-20).map((t) => ({
    role: t.role,
    content: t.content,
    files: t.role === "user" ? getChatFiles(user.id, t.fileIds ?? []) : undefined,
  }));
  try {
    const result = await buildPrompt(
      turns,
      message.trim() || DEFAULT_FILE_MESSAGE,
      getChatFiles(user.id, fileIds),
      context,
    );
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "알 수 없는 오류" };
  }
}
