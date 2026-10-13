"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export function AccountNavigation() {
  const [state, setState] = useState({ signedIn: false, registrationEnabled: false });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/navigation", { cache: "no-store", signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (data) setState(data); }).catch(() => {});
    return () => controller.abort();
  }, []);
  return <span className="flex items-center gap-4 text-sm">
    <Link href={state.signedIn ? "/account" : "/login"} className="hover:text-white">{state.signedIn ? "Open account" : "Login"}</Link>
    {!state.signedIn && state.registrationEnabled && <Link href="/signup" className="text-[#13EF93]">Sign up</Link>}
  </span>;
}
