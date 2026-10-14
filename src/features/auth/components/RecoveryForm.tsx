"use client";
import { useActionState } from "react";
import { forgotPassword, changePassword, changeEmail } from "../server/recovery-actions";
import { Captcha } from "./Captcha";

export function RecoveryForm({ mode, enabled }: { mode: "forgot" | "password" | "email"; enabled: boolean }) {
  const actions = { forgot: forgotPassword, password: changePassword, email: changeEmail };
  const [state, action, pending] = useActionState(actions[mode], {});
  const disabled = pending || !enabled;
  const input = "w-full rounded-lg border border-[#353B44] bg-[#0A0B0D] px-4 py-3";
  return <form action={action} className="space-y-4">
    {mode === "password" && <label className="block text-sm">Current password<input className={input} type="password" name="currentPassword" required maxLength={128} autoComplete="current-password" /></label>}
    <label className="block text-sm">{mode === "forgot" || mode === "email" ? "Email address" : "New password"}
      <input className={input} name={mode === "forgot" || mode === "email" ? "email" : "password"} type={mode === "forgot" || mode === "email" ? "email" : "password"}
        required minLength={mode === "forgot" || mode === "email" ? undefined : 12} maxLength={mode === "forgot" || mode === "email" ? 254 : 128}
        autoComplete={mode === "forgot" || mode === "email" ? "email" : "new-password"} disabled={disabled} /></label>
    {mode === "forgot" && <Captcha resetKey={state} />}
    <div aria-live="polite">{state.error && <p role="alert" className="text-red-300 text-sm">{state.error}</p>}{state.message && <p className="text-[#13EF93] text-sm">{state.message}</p>}</div>
    <button type="submit" disabled={disabled} className="mkt-btn-primary px-4 py-3 disabled:opacity-50">{pending ? "Please wait…" : mode === "forgot" ? "Send recovery email" : mode === "email" ? "Request email change" : "Update password"}</button>
    {!enabled && <p className="text-sm">This account control is awaiting configuration.</p>}
  </form>;
}
