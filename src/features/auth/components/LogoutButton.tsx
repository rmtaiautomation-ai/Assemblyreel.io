"use client";
import { useState } from "react";
import { logout } from "../server/actions";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <div><button className="mkt-btn-secondary px-4 py-2 disabled:opacity-50" disabled={pending} onClick={async () => {
    if (pending) return;
    setPending(true);
    try {
      const result = await logout();
      if (result.error) { setError(result.error); setPending(false); return; }
      // A full document navigation discards the current Next.js private route cache.
      window.location.replace("/");
    } catch { setError("Sign-out failed. Please try again."); setPending(false); }
  }}>{pending ? "Signing out…" : "Log out"}</button>{error && <p role="alert" className="text-red-300 mt-2 text-sm">{error}</p>}</div>;
}
