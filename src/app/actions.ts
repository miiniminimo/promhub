"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession, hashPassword, verifyPassword } from "@/lib/server/auth";
import { db } from "@/lib/server/db";

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

  const exists = db.prepare("SELECT 1 FROM users WHERE username = ?").get(username);
  if (exists) return { error: "이미 사용 중인 아이디입니다.", username };

  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, hashPassword(password));
  await createSession(Number(lastInsertRowid));
  redirect(safeNext(formData.get("next")));
}

export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const user = db.prepare("SELECT id, password_hash FROM users WHERE username = ?").get(username) as
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
