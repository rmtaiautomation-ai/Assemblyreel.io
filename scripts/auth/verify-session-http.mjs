import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

// Actual Next.js HTTP and SSR SDK, with a loopback-only synthetic Auth provider.
// No real email, credential, account, database or provider mutation is performed.
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = resolve(root, "scratch/auth-session-acceptance", new Date().toISOString().replaceAll(":", "-"));
await mkdir(directory, { recursive: true });
const secret = "synthetic-only-recovery-secret-at-least-32-characters";
const actor = { id: "synthetic-actor", email: "fixture@example.invalid", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: {} };
const expiry = Math.floor(Date.now() / 1000) + 3600;
function jwt(session, exp = expiry) {
  return [{ alg: "HS256", typ: "JWT" }, { sub: actor.id, session_id: session, exp }]
    .map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).concat("synthetic-signature").join(".");
}
function session(token, refresh = "synthetic-refresh") {
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  return { access_token: token, refresh_token: refresh, expires_at: claims.exp, expires_in: 3600, token_type: "bearer", user: actor };
}
const token = jwt("fixture-session"), renewed = jwt("renewed-session");
let updates = 0, revocations = 0, refreshes = 0, verifications = 0, revoked = false;
const fixtureFailures = [];
const provider = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const json = (value, status = 200) => response.writeHead(status, { "Content-Type": "application/json", "x-supabase-api-version": "2024-01-01" }).end(JSON.stringify(value));
    if (url.pathname === "/auth/v1/user") {
      assert.ok([token, renewed].includes(request.headers.authorization?.slice("Bearer ".length)));
      if (request.method === "PUT") {
        let body = ""; for await (const chunk of request) body += chunk;
        assert.equal(JSON.parse(body).password, "synthetic-new-password"); updates++;
      }
      json(actor);
    } else if (url.pathname === "/auth/v1/logout") {
      assert.equal(url.searchParams.get("scope"), "global");
      revocations++; revoked = true; response.writeHead(204).end();
    } else if (url.pathname === "/auth/v1/token") {
      assert.equal(url.searchParams.get("grant_type"), "refresh_token"); refreshes++;
      let body = ""; for await (const chunk of request) body += chunk;
      assert.equal(JSON.parse(body).refresh_token, "synthetic-device-refresh");
      json(revoked ? { code: "refresh_token_not_found", msg: "Synthetic refresh session revoked" } : session(renewed, "synthetic-renewed-refresh"), revoked ? 400 : 200);
    } else if (url.pathname === "/auth/v1/verify") {
      verifications++;
      let body = ""; for await (const chunk of request) body += chunk;
      assert.equal(JSON.parse(body).type, "recovery");
      json({ code: "otp_expired", msg: "Synthetic recovery link expired" }, 403);
    } else if (url.pathname === "/rest/v1/users") {
      assert.equal(request.method, "GET"); json([{ id: actor.id, email: actor.email }]);
    } else { assert.fail(`Unexpected fixture path: ${url.pathname}`); }
  } catch (error) {
    fixtureFailures.push(error); response.writeHead(500).end("Synthetic fixture failed");
  }
});
provider.listen(0, "127.0.0.1"); await once(provider, "listening");
const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
const port = reserve.address().port; await new Promise(resolveClose => reserve.close(resolveClose));
const origin = `http://localhost:${port}`;
const template = await readFile(resolve(root, "config/auth.env.example"), "utf8");
const disabled = Object.fromEntries([...template.matchAll(/^([A-Z_]+)=(?:false|true)\s*$/gm)].map(match => [match[1], "false"]));
const env = {
  ...process.env, ...disabled, NEXT_PUBLIC_SITE_URL: origin, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${provider.address().port}`,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_synthetic_fixture", AUTH_RECOVERY_SECRET: secret,
  AUTH_LAUNCH_READY: "true", APP_ACCESS_STAGE: "auth_only", AUTH_RECOVERY_ENABLED: "true",
  AUTH_ABUSE_CONTROLS_READY: "true", AUTH_CAPTCHA_REQUIRED: "true", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "synthetic-sitekey",
};
const child = spawn(process.execPath, ["--use-system-ca", "node_modules/next/dist/bin/next", "dev", "--hostname", "localhost", "--port", String(port)], {
  cwd: root, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let log = "", spawnError;
child.stdout.on("data", chunk => { log += chunk; }); child.stderr.on("data", chunk => { log += chunk; });
child.on("error", error => { spawnError = error; });
const closed = new Promise(resolveClose => child.on("close", resolveClose));
function interrupt() { child.kill(); provider.close(); }
process.on("SIGINT", interrupt); process.on("SIGTERM", interrupt);
const jar = new Map(), checks = [];
function absorb(response) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0], split = pair.indexOf("="), name = pair.slice(0, split), value = pair.slice(split + 1);
    if (!value || /Max-Age=0/i.test(cookie)) jar.delete(name); else jar.set(name, value);
  }
}
function loginFixture(access = token, refresh = "synthetic-refresh", chunked = false) {
  jar.clear();
  const encoded = "base64-" + Buffer.from(JSON.stringify(session(access, refresh))).toString("base64url");
  if (chunked) { for (let offset = 0; offset < encoded.length; offset += 3000) jar.set(`sb-127-auth-token.${offset / 3000}`, encoded.slice(offset, offset + 3000)); }
  else jar.set("sb-127-auth-token", encoded);
}
function recoveryFixture(sessionId = "fixture-session", expires = Date.now() + 600000) {
  const payload = Buffer.from(JSON.stringify({ userId: actor.id, sessionId, expires })).toString("base64url");
  jar.set("ar_recovery", payload + "." + createHmac("sha256", secret).update(payload).digest("base64url"));
}
async function request(path, options = {}) {
  return fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(30000),
    ...options, headers: { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "), ...options.headers } });
}
const submit = () => request("/api/auth/reset-password", { method: "POST", headers: { origin }, body: new URLSearchParams({ password: "synthetic-new-password" }) });
function pass(name) { checks.push({ name, passed: true }); console.log(`PASS: ${name}`); }
let failure;
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (spawnError || child.exitCode !== null) throw new Error("Fixture server did not start");
    try { if ((await request("/api/auth/navigation")).status === 200) { ready = true; break; } } catch { /* Startup only. */ }
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  assert.equal(ready, true);
  loginFixture();
  const navigation = await request("/api/auth/navigation");
  assert.deepEqual(await navigation.json(), { signedIn: true, registrationEnabled: false });
  assert.match(navigation.headers.get("cache-control"), /no-store/);
  const privatePage = await request("/account"); assert.equal(privatePage.status, 200);
  assert.match(privatePage.headers.get("cache-control"), /no-store/);
  assert.equal(privatePage.headers.get("pragma"), "no-cache"); assert.equal(privatePage.headers.get("expires"), "0");
  assert.match(await privatePage.text(), /fixture@example.invalid/);
  pass("Verified private Account and navigation response have private cache headers");

  for (const proofState of ["absent", "expired", "other-session"]) {
    loginFixture();
    if (proofState !== "absent") recoveryFixture(proofState === "other-session" ? "different-session" : "fixture-session", proofState === "expired" ? Date.now() - 1 : Date.now() + 600000);
    const before = updates, response = await submit();
    assert.equal(response.status, 303); assert.equal(response.headers.get("location"), origin + "/reset-password?error=update-failed");
    assert.equal(updates, before);
    const guarded = await request("/reset-password");
    assert.equal(guarded.headers.get("location"), "/forgot-password?error=invalid-link");
    pass(`Recovery ${proofState} proof rejects password mutation and guarded form`);
  }
  loginFixture(); recoveryFixture();
  const expiredLink = await request(`/auth/recovery?token_hash=${"a".repeat(64)}&type=recovery`);
  assert.equal(expiredLink.status, 303); assert.equal(expiredLink.headers.get("location"), origin + "/forgot-password?error=invalid-link");
  absorb(expiredLink); assert.equal(jar.has("ar_recovery"), false);
  assert.equal((await request("/api/auth/navigation").then(response => response.json())).signedIn, true);
  assert.equal(verifications, 1);
  pass("Provider-expired recovery link clears proof while preserving unrelated ordinary login");

  loginFixture(jwt("device-session", Math.floor(Date.now() / 1000) - 30), "synthetic-device-refresh");
  const refreshed = await request("/account"); assert.equal(refreshed.status, 200); absorb(refreshed);
  assert.equal(refreshes, 1);
  const stored = JSON.parse(Buffer.from(jar.get("sb-127-auth-token").slice("base64-".length), "base64url").toString());
  assert.equal(stored.access_token, renewed); assert.equal(stored.refresh_token, "synthetic-renewed-refresh");
  assert.match(await refreshed.text(), /fixture@example.invalid/);
  pass("Expired access token renews through Proxy and response receives new session cookies");

  for (const chunked of [false, true]) {
    actor.user_metadata = chunked ? { padding: "x".repeat(5000) } : {};
    loginFixture(token, "synthetic-refresh", chunked); recoveryFixture();
    const page = await request("/reset-password"); assert.equal(page.status, 200);
    const html = await page.text(); assert.match(html, /method="post"/); assert.match(html, /action="\/api\/auth\/reset-password"/);
    const response = await submit(); assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), origin + "/login?notice=password-updated");
    absorb(response); assert.equal(jar.has("ar_recovery"), false);
    assert.equal([...jar.keys()].some(name => name.startsWith("sb-127-auth-token")), false);
    const login = await request("/login?notice=password-updated"); assert.equal(login.status, 200);
    assert.match(await login.text(), /Password updated\. Log in with your new password\./);
    const account = await request("/account"); assert.equal(new URL(account.headers.get("location"), origin).pathname, "/login");
    const replay = await submit(); assert.notEqual(replay.headers.get("location"), origin + "/login?notice=password-updated");
    pass(`Native reset clears ${chunked ? "chunked" : "base"} cookies, opens Login and rejects session/proof reuse`);
  }
  assert.equal(updates, 2); assert.equal(revocations, 2);
  loginFixture(jwt("device-session", Math.floor(Date.now() / 1000) - 30), "synthetic-device-refresh");
  const revokedResponse = await request("/account");
  assert.equal(new URL(revokedResponse.headers.get("location"), origin).pathname, "/login");
  absorb(revokedResponse); assert.equal([...jar.keys()].some(name => name.startsWith("sb-127-auth-token")), false);
  assert.equal(refreshes, 2);
  const deniedBody = await revokedResponse.text(); assert.doesNotMatch(deniedBody, /fixture@example.invalid/);
  pass("Other-device revoked refresh fixture clears cookies and requires Login after access-token expiry");
  const signedOut = await request("/api/auth/navigation"); assert.equal((await signedOut.json()).signedIn, false);
  pass("Signed-out navigation contains no identity and fresh private request stays denied");

  const foreign = await request("/api/auth/reset-password", { method: "POST", headers: { origin: "https://evil.example" }, body: new URLSearchParams({ password: "synthetic-new-password" }) });
  assert.equal(foreign.status, 403); assert.equal(updates, 2);
  pass("Cross-origin reset rejected before any password mutation");
  assert.deepEqual(fixtureFailures, []);
} catch (error) { failure = error; process.exitCode = 1; }
finally {
  child.kill(); await closed;
  provider.closeAllConnections(); await new Promise(resolveClose => provider.close(resolveClose));
  process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
  await writeFile(resolve(directory, "server.log"), log);
  await writeFile(resolve(directory, "report.json"), JSON.stringify({
    checkedAt: new Date().toISOString(), passed: !failure, scope: "Local Next.js dev HTTP and actual SSR SDK with synthetic loopback provider; no live provider acceptance", checks,
    pending: ["Real browser Back/cache", "Live rate-limit response", "Controlled live link expiry", "Live other-device refresh revocation"],
  }, null, 2) + "\n");
  console.log(`Evidence: ${directory}`);
}
if (failure) throw failure;
