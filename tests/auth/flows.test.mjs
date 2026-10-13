import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../presentations/load-source.mjs";
import { NextRequest } from "next/server.js";
import { createServerClient } from "@supabase/ssr";

const moduleText = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const createClientStub = moduleText("export async function createClient(){ return globalThis.__authClient; }");
const navigationStub = moduleText("export function redirect(path){ throw new Error('REDIRECT:'+path); }");
const server = { "server-only": moduleText("export{}"), "next/headers": moduleText("export async function headers(){return new Headers({origin:'https://staging.example'})}"), "@/lib/supabase/server": createClientStub, "next/navigation": navigationStub, "next/server": new URL("../../node_modules/next/server.js", import.meta.url).href };
const actions = await loadSource(new URL("../../src/features/auth/server/actions.ts", import.meta.url), server);
const callback = await loadSource(new URL("../../src/app/auth/callback/route.ts", import.meta.url), server);
const proxy = await loadSource(new URL("../../src/lib/supabase/proxy.ts", import.meta.url), {
  "next/server": server["next/server"],
  "@supabase/ssr": moduleText("export function createServerClient(url,key,options){ globalThis.__authCookies=options.cookies; return globalThis.__authClient; }")
});
const sdkProxy = await loadSource(new URL("../../src/lib/supabase/proxy.ts", import.meta.url), {
  "next/server": server["next/server"],
});

const user = { id: "user-a", email: "a@example.com", email_confirmed_at: "now", is_anonymous: false };
function enable() {
  const keys = ["AUTH_LAUNCH_READY", "APP_ACCESS_STAGE", "AUTH_REGISTRATION_ENABLED", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { AUTH_LAUNCH_READY: "true", APP_ACCESS_STAGE: "auth_only", AUTH_REGISTRATION_ENABLED: "true", NEXT_PUBLIC_SITE_URL: "https://staging.example", NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "fixture-public-key" });
  return () => {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    delete globalThis.__authClient; delete globalThis.__authCookies;
  };
}
const form = values => { const data = new FormData(); for (const [key,value] of Object.entries(values)) data.set(key,value); return data; };

test("login validates before auth and accepts only confirmed users with safe returns", async () => {
  const restore = enable(); let calls = 0, signouts = 0;
  try {
    globalThis.__authClient = { auth: {
      signInWithPassword: async () => { calls++; return { data: { user, session: {} }, error: null }; },
      signOut: async () => { signouts++; return { error: null }; },
    } };
    assert.match((await actions.login({}, form({ email: "bad", password: "" }))).error, /valid email/);
    assert.equal(calls, 0);
    await assert.rejects(actions.login({}, form({ email: user.email, password: "password", next: "https://evil.example" })), /REDIRECT:\/account/);
    globalThis.__authClient.auth.signInWithPassword = async () => ({ data: { user: { ...user, email_confirmed_at: undefined }, session: {} }, error: null });
    assert.match((await actions.login({}, form({ email: user.email, password: "password" }))).error, /confirm your email/);
    assert.equal(signouts, 1);
    globalThis.__authClient.auth.signInWithPassword = async () => ({ data: { user: null, session: null }, error: { code: "invalid_credentials" } });
    assert.match((await actions.login({}, form({ email: user.email, password: "wrong" }))).error, /Unable to sign in/);
  } finally { restore(); }
});

test("signup hides duplicate accounts and rejects accidental auto-confirmation", async () => {
  const restore = enable(); let signouts = 0;
  try {
    globalThis.__authClient = { auth: {
      signUp: async input => { assert.equal(input.options.emailRedirectTo, "https://staging.example/auth/callback"); return { data: { session: null }, error: null }; },
      signOut: async () => { signouts++; return { error: null }; },
    } };
    const input = form({ email: user.email, password: "strong-long-password" });
    await assert.rejects(actions.signup({}, input), /REDIRECT:\/signup\/confirm/);
    globalThis.__authClient.auth.signUp = async () => ({ data: { session: null }, error: { code: "user_already_exists" } });
    await assert.rejects(actions.signup({}, input), /REDIRECT:\/signup\/confirm/);
    globalThis.__authClient.auth.signUp = async () => ({ data: { session: {} }, error: null });
    assert.match((await actions.signup({}, input)).error, /requires email confirmation/);
    assert.equal(signouts, 1);
    globalThis.__authClient.auth.signUp = async () => ({ data: { session: null }, error: { code: "unexpected_failure" } });
    assert.match((await actions.signup({}, input)).error, /Unable to register/);
  } finally { restore(); }
});

test("resend relies on provider limits; logout revokes the current refresh session", async () => {
  const restore = enable();
  try {
    globalThis.__authClient = { auth: {
      resend: async () => ({ error: { status: 429 } }),
      signOut: async options => { assert.equal(options.scope, "local"); return { error: null }; },
    } };
    assert.match((await actions.resendConfirmation({}, form({ email: user.email }))).error, /wait/);
    globalThis.__authClient.auth.resend = async () => ({ error: { status: 400, code: "user_not_found" } });
    assert.match((await actions.resendConfirmation({}, form({ email: user.email }))).message, /eligible/);
    assert.deepEqual(await actions.logout(), {});
    globalThis.__authClient.auth.signOut = async () => ({ error: new Error("provider unavailable") });
    assert.match((await actions.logout()).error, /Sign-out failed/);
  } finally { restore(); }
});

test("auth forms reject missing challenges before provider calls and explain invalid challenges or rate limits", async () => {
  const restore = enable(), previous = process.env.AUTH_CAPTCHA_REQUIRED;
  process.env.AUTH_CAPTCHA_REQUIRED = "true";
  let calls = 0, error = { code: "captcha_failed", status: 400 };
  const reject = async () => { calls++; return { data: { session: null, user: null }, error }; };
  globalThis.__authClient = { auth: { signInWithPassword: reject, signUp: reject, resend: reject } };
  try {
    for (const action of [actions.login, actions.signup, actions.resendConfirmation]) {
      const values = { email: user.email, password: "strong-long-password" };
      assert.match((await action({}, form(values))).error, /security challenge/);
      assert.equal(calls, 0);
    }
    for (const action of [actions.login, actions.signup, actions.resendConfirmation]) {
      assert.match((await action({}, form({ email: user.email, password: "strong-long-password", "cf-turnstile-response": "invalid-challenge" }))).error, /security challenge/);
    }
    assert.equal(calls, 3);
    error = { code: "over_request_rate_limit", status: 429 };
    for (const action of [actions.login, actions.signup, actions.resendConfirmation]) {
      assert.match((await action({}, form({ email: user.email, password: "strong-long-password", "cf-turnstile-response": "synthetic-challenge" }))).error, /Please wait/);
    }
  } finally {
    if (previous === undefined) delete process.env.AUTH_CAPTCHA_REQUIRED; else process.env.AUTH_CAPTCHA_REQUIRED = previous;
    restore();
  }
});

test("confirmation rejects wrong origins/types, expired or reused links without exposing tokens", async () => {
  const restore = enable(); let calls = 0;
  const hash = "a".repeat(64);
  try {
    globalThis.__authClient = { auth: { verifyOtp: async input => { calls++; assert.equal(input.type, "email"); return { data: { user, session: {} }, error: null }; } } };
    const url = `https://staging.example/auth/callback?token_hash=${hash}&type=email&next=https://evil.example`;
    const good = await callback.GET(new Request(url));
    assert.equal(good.headers.get("location"), "https://staging.example/account");
    assert.equal(good.headers.get("referrer-policy"), "no-referrer");
    for (const bad of [url.replace("staging.example", "evil.example"), url.replace("type=email", "type=recovery")]) {
      const response = await callback.GET(new Request(bad));
      assert.equal(response.headers.get("location"), "https://staging.example/signup/confirm?error=invalid");
    }
    assert.equal(calls, 1);
    globalThis.__authClient.auth.verifyOtp = async () => ({ data: { user: null, session: null }, error: { code: "otp_expired" } });
    assert.equal((await callback.GET(new Request(url))).headers.get("location"), "https://staging.example/signup/confirm?error=invalid");
  } finally { restore(); }
});

test("Proxy preserves refresh cookies and private headers on redirects and rejects forged sessions", async () => {
  const restore = enable();
  try {
    globalThis.__authClient = { auth: { getUser: async () => {
      globalThis.__authCookies.setAll([{ name: "sb-fixture", value: "refreshed", options: { path: "/", httpOnly: true } }], { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" });
      return { data: { user }, error: null };
    } } };
    const request = new NextRequest("https://staging.example/workspaces/private");
    const response = await proxy.updateSession(request);
    assert.equal(response.headers.get("location"), "https://staging.example/account");
    assert.equal(response.cookies.get("sb-fixture").value, "refreshed");
    assert.equal(request.cookies.get("sb-fixture").value, "refreshed");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("expires"), "0");
    globalThis.__authClient.auth.getUser = async () => ({ data: { user: null }, error: { code: "bad_jwt" } });
    const forged = await proxy.updateSession(new NextRequest("https://staging.example/account", { headers: { cookie: "demo_auth=true; sb-fixture=forged" } }));
    assert.equal(forged.headers.get("location"), "https://staging.example/login?next=/account");
    const asset = await proxy.updateSession(new NextRequest("https://staging.example/media/private.mp4"));
    assert.equal(asset.status, 404);
  } finally { restore(); }
});

test("default confirmation exchanges PKCE once and requires a server-verified confirmed identity", async () => {
  const restore = enable(); let exchanges = 0, signouts = 0;
  const code = "34e770dd-9ff9-416c-87fa-43b31d7ef225";
  const url = `https://staging.example/auth/callback?code=${code}&next=https://evil.example`;
  const rejected = "https://staging.example/signup/confirm?error=invalid";
  try {
    globalThis.__authClient = { auth: {
      exchangeCodeForSession: async input => { exchanges++; assert.equal(input, code); return { data: { user, session: {} }, error: null }; },
      getUser: async () => ({ data: { user }, error: null }),
      signOut: async () => { signouts++; return { error: null }; },
    } };
    const good = await callback.GET(new Request(url));
    assert.equal(good.headers.get("location"), "https://staging.example/account");
    assert.match(good.headers.get("cache-control"), /no-store/);
    assert.equal(good.headers.get("referrer-policy"), "no-referrer");
    for (const bad of [url.replace("staging.example", "evil.example"), `${url}&code=${code}`,
      `${url}&token_hash=${"a".repeat(64)}&type=email`, `${url}&type=recovery`]) {
      assert.equal((await callback.GET(new Request(bad))).headers.get("location"), rejected);
    }
    assert.equal(exchanges, 1);
    globalThis.__authClient.auth.getUser = async () => ({ data: { user: null }, error: { code: "bad_jwt" } });
    assert.equal((await callback.GET(new Request(url))).headers.get("location"), rejected);
    assert.equal(signouts, 1);
    globalThis.__authClient.auth.exchangeCodeForSession = async () => ({ data: { user: null, session: null }, error: { code: "flow_state_expired" } });
    assert.equal((await callback.GET(new Request(url))).headers.get("location"), rejected);
    process.env.AUTH_REGISTRATION_ENABLED = "false";
    assert.equal((await callback.GET(new Request(url))).headers.get("location"), rejected);
  } finally { restore(); }
});

test("real SSR client rejects a confirmation code without its signup verifier cookie", async () => {
  const restore = enable(); let networkCalls = 0;
  try {
    globalThis.__authClient = createServerClient("https://fixture.supabase.co", "fixture-public-key", {
      cookies: { getAll: () => [], setAll: () => {} },
      global: { fetch: async () => { networkCalls++; throw new Error("No network expected"); } },
    });
    const response = await callback.GET(new Request("https://staging.example/auth/callback?code=34e770dd-9ff9-416c-87fa-43b31d7ef225"));
    assert.equal(response.headers.get("location"), "https://staging.example/signup/confirm?error=invalid");
    assert.equal(networkCalls, 0);
  } finally { restore(); }
});

test("real SSR expiry refresh propagates renewed cookies through Proxy and rejects failed renewal", async () => {
  const restore = enable(), originalFetch = globalThis.fetch, originalError = console.error;
  const jwt = expiry => [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, iat: expiry - 3600, role: "authenticated" })).toString("base64url"),
    Buffer.from("synthetic-signature").toString("base64url"),
  ].join(".");
  const now = Math.floor(Date.now() / 1000), renewed = jwt(now + 3600);
  const value = "base64-" + Buffer.from(JSON.stringify({ access_token: jwt(now - 30), refresh_token: "synthetic-old-refresh",
    expires_at: now - 30, expires_in: 3600, token_type: "bearer", user })).toString("base64url");
  const request = () => new NextRequest("https://staging.example/account", { headers: { cookie: `sb-fixture-auth-token=${value}` } });
  let refreshes = 0, userReads = 0, fail = false;
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://fixture.supabase.co");
    if (url.pathname === "/auth/v1/token") {
      refreshes++;
      assert.equal(url.searchParams.get("grant_type"), "refresh_token");
      assert.equal(JSON.parse(options.body).refresh_token, "synthetic-old-refresh");
      return Response.json(fail ? { code: "refresh_token_not_found", msg: "Invalid refresh token" } : {
        access_token: renewed, refresh_token: "synthetic-new-refresh", expires_in: 3600, token_type: "bearer", user,
      }, { status: fail ? 400 : 200 });
    }
    assert.equal(url.pathname, "/auth/v1/user");
    assert.equal(new Headers(options.headers).get("authorization"), `Bearer ${renewed}`);
    userReads++;
    return Response.json(user);
  };
  try {
    const incoming = request(), response = await sdkProxy.updateSession(incoming);
    assert.equal(response.headers.has("location"), false);
    const outgoing = response.cookies.get("sb-fixture-auth-token").value;
    assert.equal(incoming.cookies.get("sb-fixture-auth-token").value, outgoing);
    const stored = JSON.parse(Buffer.from(outgoing.slice("base64-".length), "base64url").toString());
    assert.equal(stored.access_token, renewed);
    assert.equal(stored.refresh_token, "synthetic-new-refresh");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(refreshes, 1); assert.equal(userReads, 1);
    fail = true;
    console.error = error => { assert.equal(error.message, "Invalid refresh token"); };
    const denied = await sdkProxy.updateSession(request());
    assert.equal(denied.headers.get("location"), "https://staging.example/login?next=/account");
    assert.equal(denied.cookies.get("sb-fixture-auth-token").value, "");
    assert.match(denied.headers.get("cache-control"), /no-store/);
    assert.equal(refreshes, 2); assert.equal(userReads, 1);
  } finally { globalThis.fetch = originalFetch; console.error = originalError; restore(); }
});
