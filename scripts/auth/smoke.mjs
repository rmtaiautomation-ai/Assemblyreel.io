import assert from "node:assert/strict";
import { mkdir, writeFile, unlink } from "node:fs/promises";

// Run against a local production server with launch flags OFF. No Supabase signup,
// email, private-content fetch, provider job, or remote mutation is performed.
const origin = process.env.AUTH_SMOKE_ORIGIN ?? "http://localhost:3100";
const target = new URL(origin);
if (target.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(target.hostname) ||
    target.username || target.password || target.pathname !== "/" || target.search || target.hash) {
  throw new Error("Smoke fixtures require a plain HTTP loopback origin.");
}
const probe = "public/media/__auth-containment-probe.txt";
let created = false, checks = 0;
async function request(path, expected, options = {}) {
  const response = await fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(15_000), ...options });
  assert.ok((Array.isArray(expected) ? expected : [expected]).includes(response.status), `${path}: unexpected HTTP ${response.status}`);
  checks++;
  return response;
}
try {
  const landing = await request("/", 200);
  const landingMarkup = await landing.text();
  assert.match(landingMarkup, /href="\/login"/);
  assert.match(landingMarkup, /Paid plans are not on sale/);
  assert.match(landingMarkup, /Public video demo pending/);
  assert.doesNotMatch(landingMarkup, /<video\b[^>]*src=["']\/media\//);
  const pricing = await request("/pricing", 200);
  assert.match(await pricing.text(), /Paid plans are not on sale/);
  const login = await request("/login", 200);
  const markup = await login.text();
  assert.match(markup, /name="email"/);
  assert.match(markup, /name="password"/);
  assert.match(markup, /awaiting configuration/);
  await request("/signup", 200);
  await request("/signup/confirm", 200);
  await request("/forgot-password",200);
  await request("/reset-password",307);
  for (const path of ["/account", "/account/billing", "/account/projects/fixture", "/onboarding", "/workspaces", "/workspaces/new", "/billing", "/integrations", "/workspaces/fixture/videos/fixture"]) {
    const response = await request(path, 307);
    assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login");
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
  const handlers = [
    ["/api/ai/brainstorm", "POST"], ["/api/ai/generate-script", "POST"],
    ["/api/media/upload", "POST"], ["/api/media/from-url", "POST"], ["/api/media/generate", "POST"],
    ["/api/media/fixture/status", "GET"], ["/api/render/download?path=../synthetic", "GET"],
    ["/api/sync-timeline-assets", "POST"], ["/api/stock-media", "GET"],
    ["/api/render-remotion", "GET"], ["/api/render-remotion", "POST"],
    ["/api/stripe/checkout", "POST"], ["/api/stripe/portal", "POST"], ["/api/stripe/webhook", "POST"],
  ];
  for (const [path, method] of handlers) {
    const response = await request(path, 503, { method });
    assert.equal((await response.json()).code, "FEATURE_UNAVAILABLE");
  }
  await request("/api/leads", 503, { method: "POST" });
  const navigation = await request("/api/auth/navigation", 200);
  assert.deepEqual(await navigation.json(), { signedIn: false, registrationEnabled: false });
  for (const [path, destination] of [
    ["/auth/callback?token_hash=invalid&type=email", "/signup/confirm?error=invalid"],
    ["/auth/recovery?token_hash=invalid&type=recovery", "/forgot-password?error=invalid-link"],
    ["/auth/email-change?token_hash=invalid&type=email_change", "/login?notice=invalid-email-link"],
  ]) {
    // Unconfigured origin returns 503; a configured local origin redirects to
    // the exact safe error page. Neither outcome verifies a token or logs in.
    const response = await request(path, [303, 503]);
    if (response.status === 303) {
      assert.equal(response.headers.get("location"), new URL(destination, origin).href);
      assert.match(response.headers.get("cache-control"), /no-store/);
      assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    }
  }
  await request("/api/account/workspaces",503);
  await request("/api/account/onboarding",503);
  await request("/api/account/onboarding",503,{method:"POST"});
  await request("/api/account/billing",503);
  await request("/api/account/billing/enroll",503,{method:"POST"});
  await request("/api/account/billing/invoices",503);
  await request("/api/account/jobs?projectId=invalid",503);
  await request("/api/account/jobs",503,{method:"POST"});
  await request("/api/account/jobs/fixture",503);
  await request("/api/account/jobs/fixture",503,{method:"DELETE"});
  await request("/api/account/workspaces",503,{method:"POST"});
  await request("/api/account/projects?workspaceId=invalid",503);
  await request("/api/account/resources",503,{method:"PATCH"});
  await request("/api/media/fixture/content",503);
  await mkdir("public/media", { recursive: true });
  await writeFile(probe, "synthetic-auth-probe", { flag: "wx" }); created = true;
  await request("/media/__auth-containment-probe.txt", 404);
  await request("/_next/image?url=%2Fmedia%2F__auth-containment-probe.txt&w=640&q=75", 400);
  console.log(`PASS: ${checks} local production HTTP checks; no remote mutations or provider work.`);
} finally { if (created) await unlink(probe); }
