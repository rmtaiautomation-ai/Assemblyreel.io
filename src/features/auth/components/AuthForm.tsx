"use client";

import { useActionState } from "react";
import { login, signup, resendConfirmation, type AuthFormState } from "../server/actions";
import { Captcha } from "./Captcha";

export function AuthForm({ mode, next = "/account", enabled = true }: { mode: "login" | "signup" | "resend"; next?: string; enabled?: boolean }) {
  const action = mode === "login" ? login : mode === "signup" ? signup : resendConfirmation;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(action, {});
  const inputClass = "w-full rounded-lg border border-[#353B44] bg-[#0A0B0D] px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#13EF93]";
  return <form action={formAction} className="space-y-5">
    <input type="hidden" name="next" value={next} />
    <div><label htmlFor="email" className="block mb-2 text-sm">Email address</label>
      <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} className={inputClass} disabled={pending || !enabled} /></div>
    {mode !== "resend" && <div><label htmlFor="password" className="block mb-2 text-sm">Password</label>
      <input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 12 : 1} maxLength={128} className={inputClass} disabled={pending || !enabled} />
      {mode === "signup" && <p className="mt-2 text-xs text-[#B5BCC6]">Use at least 12 characters. Confirm your email before signing in.</p>}</div>}
    <Captcha resetKey={state} />
    <div aria-live="polite">{state.error && <p role="alert" className="text-red-300 text-sm">{state.error}</p>}{state.message && <p className="text-[#13EF93] text-sm">{state.message}</p>}</div>
    <button disabled={pending || !enabled} className="mkt-btn-primary w-full justify-center py-3 disabled:opacity-50" type="submit">
      {pending ? "Please wait…" : mode === "login" ? "Log in" : mode === "signup" ? "Create account" : "Resend confirmation"}</button>
    {!enabled && <p className="text-sm text-[#B5BCC6]">{mode === "login" ? "Account access is awaiting configuration." : "Registration is not open yet."}</p>}
  </form>;
}
