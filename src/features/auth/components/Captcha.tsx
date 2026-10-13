"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = { render(element: HTMLElement, options: Record<string, unknown>): string; remove(id: string): void; reset(id: string): void };
export function Captcha({ resetKey }: { resetKey: unknown }) {
  const element = useRef<HTMLDivElement>(null), widget = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    const turnstile = (window as Window & { turnstile?: Turnstile }).turnstile;
    if (!ready || !sitekey || !element.current || !turnstile) return;
    widget.current = turnstile.render(element.current, { sitekey, theme: "dark", size: "flexible", "response-field-name": "cf-turnstile-response" });
    return () => { if (widget.current) turnstile.remove(widget.current); widget.current = null; };
  }, [ready, sitekey]);
  useEffect(() => {
    if (widget.current) (window as Window & { turnstile?: Turnstile }).turnstile?.reset(widget.current);
  }, [resetKey]);
  if (!sitekey) return null;
  return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setReady(true)} /><div ref={element} aria-label="Security challenge" /></>;
}
