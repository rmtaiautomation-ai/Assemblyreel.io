import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectBillingEnvironment } from "../../scripts/billing/readiness.mjs";

function fakeJwt(role) {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.fakeSignature`;
}

function testEnvironment(overrides = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: fakeJwt("anon"),
    SUPABASE_SERVICE_ROLE_KEY: fakeJwt("service_role"),
    STRIPE_SECRET_KEY: "sk_test_syntheticSecret123",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_syntheticPublic123",
    STRIPE_WEBHOOK_SECRET: "whsec_syntheticSigning123",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    ...overrides,
  };
}

function check(report, name) {
  return report.checks.find((item) => item.name === name);
}

test("missing configuration blocks readiness without throwing", () => {
  const report = inspectBillingEnvironment({});
  assert.equal(report.configurationPass, false);
  assert.equal(report.stripeMode, "unknown");
  assert.ok(report.checks.every((item) => !item.pass));
});

test("valid-looking test configuration still requires remote and commercial verification", () => {
  const report = inspectBillingEnvironment(testEnvironment());
  assert.equal(report.configurationPass, true);
  assert.equal(report.stripeMode, "test");
  assert.equal(report.outstanding.length, 4);
});

test("placeholder secret values are not treated as configured", () => {
  for (const value of ["", "   ", "sk_test_dummy", "sk_test_placeholder", "sk_test_your_key"]) {
    const report = inspectBillingEnvironment(testEnvironment({ STRIPE_SECRET_KEY: value }));
    assert.equal(check(report, "STRIPE_SECRET_KEY").pass, false);
  }
});

test("mismatched Stripe modes and live-only configuration block Phase 0", () => {
  const mismatched = inspectBillingEnvironment(testEnvironment({
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_syntheticPublic123",
  }));
  assert.equal(check(mismatched, "STRIPE_KEY_MODE_MATCH").pass, false);
  const live = inspectBillingEnvironment(testEnvironment({
    STRIPE_SECRET_KEY: "sk_live_syntheticSecret123",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_syntheticPublic123",
  }));
  assert.equal(live.stripeMode, "live");
  assert.equal(live.configurationPass, false);
});

test("restricted test keys are recognized without implying permission verification", () => {
  const report = inspectBillingEnvironment(testEnvironment({ STRIPE_SECRET_KEY: "rk_test_synthetic123" }));
  assert.equal(report.stripeMode, "test");
  assert.equal(report.configurationPass, true);
});

test("public Supabase settings reject admin keys", () => {
  for (const key of [fakeJwt("service_role"), "sb_secret_synthetic123", "sb_publishable_", "malformed"]) {
    const report = inspectBillingEnvironment(testEnvironment({ NEXT_PUBLIC_SUPABASE_ANON_KEY: key }));
    assert.equal(check(report, "NEXT_PUBLIC_SUPABASE_ANON_KEY").pass, false);
  }
});

test("server Supabase settings reject anon keys and accept supported key formats", () => {
  const rejected = inspectBillingEnvironment(testEnvironment({ SUPABASE_SERVICE_ROLE_KEY: fakeJwt("anon") }));
  assert.equal(check(rejected, "SUPABASE_SERVICE_ROLE_KEY").pass, false);
  const accepted = inspectBillingEnvironment(testEnvironment({
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_synthetic123",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_synthetic123",
  }));
  assert.equal(accepted.configurationPass, true);
});

test("unsafe or non-origin URLs fail format checks", () => {
  for (const origin of [
    "http://example.com", "https://user:password@example.com", "https://example.com/path",
    "https://example.com?token=sensitive", "https://example.com#fragment", "not-a-url",
  ]) {
    const report = inspectBillingEnvironment(testEnvironment({ NEXT_PUBLIC_SITE_URL: origin }));
    assert.equal(check(report, "NEXT_PUBLIC_SITE_URL").pass, false);
  }
});

test("loopback HTTP and HTTPS origins are supported", () => {
  for (const origin of ["http://localhost:3000", "http://127.0.0.1:54321", "http://[::1]:3000", "https://staging.example.com/"]) {
    const report = inspectBillingEnvironment(testEnvironment({ NEXT_PUBLIC_SITE_URL: origin }));
    assert.equal(check(report, "NEXT_PUBLIC_SITE_URL").pass, true);
  }
});

test("reports never contain raw environment values and do not mutate inputs", () => {
  const environment = Object.freeze(testEnvironment({
    OPENAI_API_KEY: "anUnrelatedSecretNeverToBeReported",
    STRIPE_WEBHOOK_SECRET: "aBadSecretNeverToBeReported",
  }));
  const before = { ...environment };
  const serialized = JSON.stringify(inspectBillingEnvironment(environment));
  for (const value of Object.values(environment)) assert.equal(serialized.includes(value), false);
  assert.deepEqual(environment, before);
});

function runCli(args) {
  return spawnSync(process.execPath, [
    fileURLToPath(new URL("../../scripts/billing/check-readiness.mjs", import.meta.url)),
    ...args,
  ], { encoding: "utf8", env: { ...process.env, ...testEnvironment() } });
}

test("CLI help does not require configuration", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Offline format checks only/);
});

test("explicit missing environment files fail instead of silently using inherited keys", () => {
  const result = runCli(["--config-file", "tests/billing/intentionally-missing-env-file"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Billing readiness check failed/);
});

test("CLI argument errors do not echo potentially secret values", () => {
  const sentinel = "sensitiveCliValueNeverToBeReported";
  const result = runCli([`--unknown-${sentinel}`]);
  assert.equal(result.status, 1);
  assert.equal(`${result.stdout}${result.stderr}`.includes(sentinel), false);
});
