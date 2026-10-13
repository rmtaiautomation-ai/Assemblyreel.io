import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "../presentations/load-source.mjs";

const text = source => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const stubs = {
  "server-only": text("export{}"),
  "next/headers": text("export async function cookies(){return globalThis.__emailCookies} export async function headers(){return new Headers()}"),
  "next/server": new URL("../../node_modules/next/server.js", import.meta.url).href,
  "@/lib/supabase/server": text("export async function createClient(){return globalThis.__emailClient}"),
};
const recovery = await loadSource(new URL("../../src/app/auth/recovery/route.ts", import.meta.url), stubs);
const emailChange = await loadSource(new URL("../../src/app/auth/email-change/route.ts", import.meta.url), stubs);
const proof = await loadSource(new URL("../../src/server/auth/recovery-proof.ts", import.meta.url), stubs);
const hash = `pkce_${"a".repeat(64)}`;
const actor = { id: "actor", email: "a@example.com", email_confirmed_at: "now" };

function fixture() {
  const values = {
    NEXT_PUBLIC_SITE_URL: "https://staging.example", APP_ACCESS_STAGE: "auth_only", AUTH_LAUNCH_READY: "true",
    AUTH_RECOVERY_ENABLED: "true", AUTH_ABUSE_CONTROLS_READY: "true", AUTH_CAPTCHA_REQUIRED: "true",
    AUTH_EMAIL_CHANGE_ENABLED: "true",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "synthetic-public-sitekey", AUTH_RECOVERY_SECRET: "synthetic-secret-at-least-32-characters",
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  const calls = { verify: 0, claims: 0, signout: 0 };
  const cookies = new Map([[proof.RECOVERY_COOKIE, { value: "stale-proof" }]]);
  globalThis.__emailCookies = {
    get: key => cookies.get(key), delete: key => cookies.delete(key),
    set: (key, value, options) => cookies.set(key, { value, options }),
  };
  globalThis.__emailClient = { auth: {
    async verifyOtp(input) { calls.verify++; calls.input = input; return { data: { user: actor, session: {} }, error: null }; },
    async getClaims() { calls.claims++; return { data: { claims: { sub: actor.id, session_id: "recovery-session" } }, error: null }; },
    async signOut(options) { assert.equal(options.scope, "local"); calls.signout++; return { error: null }; },
  } };
  return { calls, cookies, restore() {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    delete globalThis.__emailCookies; delete globalThis.__emailClient;
  } };
}
const request = (type, query = `token_hash=${hash}&type=${type}`, origin = "https://staging.example") =>
  new Request(`${origin}/auth/${type === "recovery" ? "recovery" : "email-change"}?${query}`);

test("prefixed recovery hashes create only a verified user/session-bound private proof", async () => {
  const f = fixture();
  try {
    const response = await recovery.GET(request("recovery"));
    assert.equal(response.headers.get("location"), "https://staging.example/reset-password");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.deepEqual(f.calls.input, { token_hash: hash, type: "recovery" });
    const cookie = f.cookies.get(proof.RECOVERY_COOKIE);
    assert.equal(proof.validRecoveryProof(cookie.value, actor.id, "recovery-session"), true);
    assert.equal(proof.validRecoveryProof(cookie.value, "other", "recovery-session"), false);
    assert.deepEqual(cookie.options, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
    assert.equal(f.calls.signout, 0);
  } finally { f.restore(); }
});

test("wrong-flow, mixed, duplicate, malformed and foreign-origin links never reach verification", async () => {
  const f = fixture();
  try {
    for (const [type, route] of [["recovery", recovery], ["email_change", emailChange]]) {
      const base = `token_hash=${hash}&type=${type}`;
      for (const query of [base.replace(type, "email"), `${base}&type=${type}`, `${base}&token_hash=${hash}`,
        `${base}&code=${"b".repeat(32)}`, `${base}&error=expired`, `${base}&error_code=otp_expired`,
        `token_hash=pkce_script&type=${type}`, `token_hash=${"a".repeat(129)}&type=${type}`]) {
        const response = await route.GET(request(type, query));
        assert.equal(response.status, 303);
        assert.match(response.headers.get("location"), /invalid/);
        assert.equal(response.headers.get("location").includes(hash), false);
      }
      assert.match((await route.GET(request(type, base, "https://evil.example"))).headers.get("location"), /^https:\/\/staging.example\/.+invalid/);
    }
    assert.equal(f.calls.verify, 0);
    assert.equal(f.cookies.has(proof.RECOVERY_COOKIE), false);
    process.env.AUTH_CAPTCHA_REQUIRED = "false";
    assert.match((await recovery.GET(request("recovery"))).headers.get("location"), /invalid/);
    assert.equal(f.calls.verify, 0);
  } finally { f.restore(); }
});

test("expired or reused recovery tokens clear stale proof without signing out an unrelated login", async () => {
  const f = fixture();
  try {
    globalThis.__emailClient.auth.verifyOtp = async () => ({ data: { user: null, session: null }, error: { code: "otp_expired" } });
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await recovery.GET(request("recovery"))).headers.get("location"), "https://staging.example/forgot-password?error=invalid-link");
      assert.equal(f.cookies.has(proof.RECOVERY_COOKIE), false);
    }
    assert.equal(f.calls.claims, 0);
    assert.equal(f.calls.signout, 0);
  } finally { f.restore(); }
});

test("a newly established recovery session is discarded when claims, identity or proof creation fail", async () => {
  for (const failure of ["claims-error", "claims-throw", "wrong-user", "missing-session", "unconfirmed", "missing-secret"]) {
    const f = fixture();
    try {
      if (failure === "claims-error") globalThis.__emailClient.auth.getClaims = async () => ({ data: null, error: {} });
      if (failure === "claims-throw") globalThis.__emailClient.auth.getClaims = async () => { throw new Error("unavailable"); };
      if (failure === "wrong-user") globalThis.__emailClient.auth.getClaims = async () => ({ data: { claims: { sub: "other", session_id: "session" } }, error: null });
      if (failure === "missing-session") globalThis.__emailClient.auth.getClaims = async () => ({ data: { claims: { sub: actor.id } }, error: null });
      if (failure === "unconfirmed") globalThis.__emailClient.auth.verifyOtp = async () => ({ data: { user: { ...actor, email_confirmed_at: null }, session: {} }, error: null });
      if (failure === "missing-secret") delete process.env.AUTH_RECOVERY_SECRET;
      assert.match((await recovery.GET(request("recovery"))).headers.get("location"), /invalid-link/, failure);
      assert.equal(f.cookies.has(proof.RECOVERY_COOKIE), false, failure);
      assert.equal(f.calls.signout, 1, failure);
    } finally { f.restore(); }
  }
});

test("email change handles secure first-link confirmation without granting a recovery proof", async () => {
  const f = fixture();
  try {
    globalThis.__emailClient.auth.verifyOtp = async input => {
      assert.deepEqual(input, { token_hash: hash, type: "email_change" });
      return { data: { user: null, session: null }, error: null };
    };
    const response = await emailChange.GET(request("email_change"));
    assert.equal(response.headers.get("location"), "https://staging.example/login?notice=email-confirmation-processed");
    assert.equal(f.cookies.get(proof.RECOVERY_COOKIE).value, "stale-proof");
    assert.equal(f.calls.claims, 0);
    assert.match(response.headers.get("cache-control"), /no-store/);
    globalThis.__emailClient.auth.verifyOtp = async () => ({ error: { code: "otp_expired" } });
    assert.match((await emailChange.GET(request("email_change"))).headers.get("location"), /invalid-email-link/);
    process.env.AUTH_EMAIL_CHANGE_ENABLED = "false";
    globalThis.__emailClient.auth.verifyOtp = async () => { assert.fail("Disabled email change must not reach Supabase"); };
    assert.match((await emailChange.GET(request("email_change"))).headers.get("location"), /invalid-email-link/);
  } finally { f.restore(); }
});
