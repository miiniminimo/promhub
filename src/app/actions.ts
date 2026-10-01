"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getChallenge, grade, scoreOf, type TestResult } from "@/lib/challenges";
import { getPost } from "@/lib/posts";
import { createSession, destroySession, getCurrentUser, hashPassword, requireUser, verifyPassword } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { addCommit, createRepo, forkPost, forkRepo, getRepo, saveImage, setVisibility, slugify } from "@/lib/server/repos";
import { buildPrompt, type BuilderContext, type BuilderResult, type BuilderTurn } from "@/lib/server/prompt-builder";
import { saveSubmission } from "@/lib/server/submissions";
import type { Style } from "@/lib/types";

export type FormState = { error?: string; username?: string } | undefined;

const USERNAME = /^[a-z0-9_]{3,20}$/;

function safeNext(next: FormDataEntryValue | null) {
  const value = typeof next === "string" ? next : "";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

// ---------- Auth ----------

export async function signup(_: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!USERNAME.test(username)) return { error: "아이디는 영문 소문자·숫자·_ 3~20자로 입력해주세요.", username };
  if (password.length < 6) return { error: "비밀번호는 6자 이상이어야 합니다.", username };
  if (password !== formData.get("passwordConfirm")) return { error: "비밀번호가 일치하지 않습니다.", username };

  const exists = getDb().prepare("SELECT 1 FROM users WHERE username = ?").get(username);
  if (exists) return { error: "이미 사용 중인 아이디입니다.", username };

  const { lastInsertRowid } = getDb()
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, hashPassword(password));
  await createSession(Number(lastInsertRowid));
  redirect(safeNext(formData.get("next")));
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = getDb().prepare("SELECT id, password_hash FROM users WHERE username = ?").get(username) as
    | { id: number; password_hash: string }
    | undefined;
  if (!user || !verifyPassword(password, user.password_hash)) {
    return { error: "아이디 또는 비밀번호가 올바르지 않습니다.", username };
  }
  await createSession(user.id);
  redirect(safeNext(formData.get("next")));
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

export async function commitAction(repoId: number, _: FormState, formData: FormData): Promise<FormState> {
  await ownedRepo(repoId);
  const prompt = String(formData.get("prompt") ?? "").trim();
  const negativePrompt = String(formData.get("negativePrompt") ?? "").trim();
  if (!prompt) return { error: "프롬프트를 입력해주세요." };

  addCommit(repoId, {
    message: String(formData.get("message") ?? "").trim() || "Update prompt",
    prompt,
    negativePrompt: negativePrompt || null,
  });
  redirect(`/repos/${repoId}`);
}

export async function toggleVisibilityAction(repoId: number) {
  const repo = await ownedRepo(repoId);
  setVisibility(repoId, repo.visibility === "public" ? "private" : "public");
  revalidatePath("/", "layout");
}

const STYLES: Style[] = ["anime", "photo", "illustration"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function createRepoAction(_: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/new");
  const title = String(formData.get("title") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const style = String(formData.get("style")) as Style;
  const prompt = String(formData.get("prompt") ?? "").trim();
  const negativePrompt = String(formData.get("negativePrompt") ?? "").trim();
  const visibility = formData.get("visibility") === "private" ? "private" : "public";
  if (!title || !model || !prompt) return { error: "제목, 사용 모델, 프롬프트는 필수입니다." };
  if (!STYLES.includes(style)) return { error: "스타일을 선택해주세요." };

  let cover = null;
  const file = formData.get("image");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) return { error: "이미지 파일만 올릴 수 있습니다." };
    if (file.size > MAX_IMAGE_BYTES) return { error: "이미지는 5MB 이하만 올릴 수 있습니다." };
    const imageId = saveImage(user.id, file.type, Buffer.from(await file.arrayBuffer()));
    cover = {
      src: `/api/images/${imageId}`,
      width: Number(formData.get("imageWidth")) || 1024,
      height: Number(formData.get("imageHeight")) || 1024,
    };
  }

  const repoId = createRepo({
    ownerId: user.id,
    name: slugify(title),
    description: title,
    model,
    style,
    cover,
    visibility,
    prompt,
    negativePrompt: negativePrompt || null,
    message: "Initial commit",
  });
  redirect(`/repos/${repoId}`);
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

export async function chatPromptBuilder(
  history: BuilderTurn[],
  message: string,
  context: BuilderContext,
): Promise<{ ok: true; result: BuilderResult } | { ok: false; error: string }> {
  await requireUser("/new");
  if (!message.trim()) return { ok: false, error: "메시지를 입력해주세요." };
  if (!STYLES.includes(context.style)) return { ok: false, error: "스타일을 선택해주세요." };
  try {
    return { ok: true, result: await buildPrompt(history.slice(-20), message.trim(), context) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "알 수 없는 오류" };
  }
}
