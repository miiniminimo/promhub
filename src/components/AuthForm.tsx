"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, signup } from "@/app/actions";
import { fieldClass } from "./ui";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next: string }) {
  const [state, action, pending] = useActionState(mode === "login" ? login : signup, undefined);
  const isLogin = mode === "login";
  const otherHref = `${isLogin ? "/signup" : "/login"}?next=${encodeURIComponent(next)}`;

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="label-mono text-secondary">아이디</span>
        <input
          name="username"
          required
          autoComplete="username"
          defaultValue={state?.username}
          className={`${fieldClass} mt-2`}
        />
      </label>
      <label className="block">
        <span className="label-mono text-secondary">비밀번호</span>
        <input
          name="password"
          type="password"
          required
          autoComplete={isLogin ? "current-password" : "new-password"}
          className={`${fieldClass} mt-2`}
        />
      </label>
      {!isLogin && (
        <label className="block">
          <span className="label-mono text-secondary">비밀번호 확인</span>
          <input name="passwordConfirm" type="password" required autoComplete="new-password" className={`${fieldClass} mt-2`} />
        </label>
      )}

      {state?.error && (
        <p className="rounded-tag border border-ultraviolet px-3 py-2 text-sm text-muted">{state.error}</p>
      )}

      <button type="submit" disabled={pending} className="btn-mint w-full py-2.5 disabled:opacity-50">
        {isLogin ? "Log in" : "Sign up"}
      </button>
      <p className="text-center text-sm text-secondary">
        {isLogin ? "아직 계정이 없나요? " : "이미 계정이 있나요? "}
        <Link href={otherHref} className="link-hover text-mint">
          {isLogin ? "회원가입" : "로그인"}
        </Link>
      </p>
    </form>
  );
}
