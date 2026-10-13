import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScript } from "../billing/import-typescript.mjs";

const policy = await importTypeScript(new URL("../../src/server/auth/policy.ts", import.meta.url));
const capabilities = await importTypeScript(new URL("../../src/server/auth/capabilities.ts", import.meta.url), { serverOnly: true });

test("only the account return route is permitted", () => {
  for (const value of [undefined, "https://evil.example", "//evil.example", "/workspaces", "/account?next=//evil.example", "/%2f%2fevil", "\\evil", ["/account"]]) {
    assert.equal(policy.safeReturnPath(value), "/account");
  }
  assert.equal(policy.safeReturnPath("/account"), "/account");
});

test("site origin rejects credentials, insecure hosted URLs and URL suffixes", () => {
  assert.equal(policy.siteOrigin("https://staging.example/"), "https://staging.example");
  assert.equal(policy.siteOrigin("http://localhost:3000"), "http://localhost:3000");
  for (const value of ["http://example.com", "https://user:secret@example.com", "https://example.com/path", "https://example.com/?next=evil", "https://example.com/#evil", "javascript:alert(1)"]) {
    assert.throws(() => policy.siteOrigin(value));
  }
});

test("anonymous or unconfirmed identities are rejected", () => {
  assert.equal(policy.confirmedIdentity(null), false);
  assert.equal(policy.confirmedIdentity({ email: "a@example.com" }), false);
  assert.equal(policy.confirmedIdentity({ email: "a@example.com", email_confirmed_at: "now", is_anonymous: true }), false);
  assert.equal(policy.confirmedIdentity({ email: "a@example.com", email_confirmed_at: "now" }), true);
  assert.equal(policy.confirmedIdentity({ email: "a@example.com", email_confirmed_at: "now", banned_until: "2999-01-01T00:00:00Z" }), false);
});

test("launch and registration require explicit readiness and a supported stage", () => {
  const original = { ...process.env };
  try {
    delete process.env.AUTH_LAUNCH_READY;
    assert.equal(policy.authLaunchReady(), false);
    process.env.AUTH_LAUNCH_READY = "true";
    process.env.APP_ACCESS_STAGE = "full_service";
    assert.equal(policy.authLaunchReady(), false);
    process.env.APP_ACCESS_STAGE = "auth_only";
    assert.equal(policy.authLaunchReady(), true);
    delete process.env.AUTH_REGISTRATION_ENABLED;
    assert.equal(policy.registrationEnabled(), false);
    process.env.AUTH_REGISTRATION_ENABLED = "true";
    assert.equal(policy.registrationEnabled(), true);
    assert.equal(capabilities.legacyServiceEnabled(), false);
    assert.throws(() => capabilities.requireLegacyServiceAvailable(), /FEATURE_UNAVAILABLE/);
    const response = capabilities.legacyFeatureResponse();
    assert.equal(response.status, 503);
    assert.match(response.headers.get("cache-control"), /no-store/);
  } finally {
    for (const key of ["AUTH_LAUNCH_READY", "APP_ACCESS_STAGE", "AUTH_REGISTRATION_ENABLED"]) {
      if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
    }
  }
});

test("confirmation accepts only the configured email token-hash flow", () => {
  const hash = "a".repeat(64);
  assert.equal(policy.confirmationToken(new URLSearchParams({ token_hash: hash, type: "email" })), hash);
  assert.equal(policy.confirmationToken(new URLSearchParams({ token_hash: `pkce_${hash}`, type: "email" })), `pkce_${hash}`);
  for (const query of [`token_hash=${hash}&type=recovery`, `token_hash=${hash}&type=email&code=pkce`, `token_hash=${hash}&token_hash=${hash}&type=email`, "type=email&token_hash=<script>", `token_hash=${hash}`]) {
    assert.equal(policy.confirmationToken(new URLSearchParams(query)), null);
  }
});

test("confirmation codes reject duplicate, mixed, malformed and error parameters", () => {
  const code = "34e770dd-9ff9-416c-87fa-43b31d7ef225";
  assert.equal(policy.confirmationCode(new URLSearchParams({ code })), code);
  for (const query of [`code=${code}&code=${code}`, `code=${code}&type=email`,
    `code=${code}&token_hash=${"a".repeat(64)}`, `code=${code}&error=denied`,
    `code=${code}&error_code=expired`, "code=short", "code=%3Cscript%3E", `code=${"a".repeat(513)}`]) {
    assert.equal(policy.confirmationCode(new URLSearchParams(query)), null);
  }
});

test("credentials and lead payloads have server-side length and type limits", async () => {
  const { leadSchema } = await importTypeScript(new URL("../../src/server/auth/leads.ts", import.meta.url));
  assert.equal(policy.signupSchema.safeParse({ email: "a@example.com", password: "short" }).success, false);
  assert.equal(policy.loginSchema.safeParse({ email: "invalid", password: "password" }).success, false);
  assert.equal(policy.signupSchema.parse({ email: " User@Example.com ", password: "a".repeat(12) }).email, "user@example.com");
  const input = { email: "a@example.com", requestType: "demo", videoLength: "10-20m" };
  assert.equal(leadSchema.safeParse({ ...input, challenge: "x".repeat(2001) }).success, false);
  assert.equal(leadSchema.safeParse({ ...input, updatesConsent: "true" }).success, false);
  assert.equal(leadSchema.parse(input).updatesConsent, false);
});
