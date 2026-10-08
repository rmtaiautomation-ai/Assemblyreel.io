import assert from "node:assert/strict";
import test from "node:test";
import { importTypeScript } from "./import-typescript.mjs";

const { evaluateBillingAccess } = await importTypeScript(new URL("../../src/server/billing/entitlements.ts", import.meta.url));
const { USAGE_METRICS, SUBSCRIPTION_STATUSES } = await importTypeScript(new URL("../../src/features/billing/types.ts", import.meta.url));
const { APPROVED_BILLING_PLANS, BILLING_ENABLED_BY_DEFAULT, PLAN_PROPOSALS, LAUNCH_PREVIEW_MODE } = await importTypeScript(new URL("../../src/features/billing/plans.ts", import.meta.url));

const ACCOUNT_A = "10000000-0000-4000-8000-000000000001";
const USER_A = "20000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const NOW = Date.parse("2026-10-06T12:00:00Z");

// Synthetic finite allowances for tests, not approved commercial terms.
const plan = Object.freeze({
  id: "creator", version: "test-v1", approved: true, workspaceLimit: 1,
  limits: Object.freeze(Object.fromEntries(USAGE_METRICS.map((metric) => [metric, 10]))),
  features: Object.freeze(["generation"]),
});
const subscription = Object.freeze({
  accountId: ACCOUNT_A, ownerId: USER_A, accountEnabled: true,
  status: "active", planId: "creator", catalogVersion: "test-v1", isCurrent: true,
  verifiedAt: "2026-10-06T11:00:00Z", accessStartsAt: "2026-10-01T00:00:00Z",
  accessExpiresAt: "2026-11-01T00:00:00Z", cancelAtPeriodEnd: false, pauseCollection: false,
});
function input(overrides = {}) {
  return { actorId: USER_A, subscription, billingEnabled: true, approvedPlans: [plan], now: NOW, ...overrides };
}
function deny(overrides, code) {
  assert.deepEqual(evaluateBillingAccess(input(overrides)), { allowed: false, code });
}

test("launch catalog is empty, proposals grant nothing, and preview is sample-only", () => {
  assert.equal(BILLING_ENABLED_BY_DEFAULT, false);
  assert.equal(LAUNCH_PREVIEW_MODE, "sample_only");
  assert.deepEqual(APPROVED_BILLING_PLANS, []);
  assert.equal(PLAN_PROPOSALS.length, 3);
  deny({ approvedPlans: APPROVED_BILLING_PLANS }, "PLAN_NOT_CONFIGURED");
  deny({ billingEnabled: BILLING_ENABLED_BY_DEFAULT }, "BILLING_DISABLED");
});

test("omitted activation and catalog inputs fail closed", () => {
  assert.deepEqual(evaluateBillingAccess({ actorId: USER_A, subscription, now: NOW }), {
    allowed: false, code: "BILLING_DISABLED",
  });
  deny({ approvedPlans: undefined }, "PLAN_NOT_CONFIGURED");
});

test("a paid verified current subscription can access an explicitly approved feature", () => {
  assert.deepEqual(evaluateBillingAccess(input()), { allowed: true, accountId: ACCOUNT_A, plan });
});

test("ambiguous duplicate catalog versions cannot choose arbitrary quota limits", () => {
  deny({ approvedPlans: [plan, { ...plan, workspaceLimit: 100 }] }, "PLAN_NOT_CONFIGURED");
});

test("missing actor and subscription cannot grant access", () => {
  deny({ actorId: null }, "AUTH_REQUIRED");
  deny({ subscription: null }, "SUBSCRIPTION_REQUIRED");
});

test("another user or an orphan account cannot access the subscription", () => {
  deny({ actorId: USER_B }, "OWNERSHIP_REQUIRED");
  deny({ subscription: { ...subscription, ownerId: null } }, "OWNERSHIP_REQUIRED");
});

test("account disable and historical subscriptions fail closed", () => {
  deny({ subscription: { ...subscription, accountEnabled: false } }, "BILLING_DISABLED");
  deny({ subscription: { ...subscription, isCurrent: false } }, "SUBSCRIPTION_REQUIRED");
});

for (const status of [...SUBSCRIPTION_STATUSES.filter((value) => value !== "active"), "unrecognized"]) {
  test(`${status} does not grant costly operations in the sample-only launch`, () => {
    deny({ subscription: { ...subscription, status } }, "SUBSCRIPTION_REQUIRED");
  });
}

test("pause collection and malformed booleans do not grant implicit grace", () => {
  deny({ subscription: { ...subscription, pauseCollection: true } }, "SUBSCRIPTION_REQUIRED");
  deny({ subscription: { ...subscription, pauseCollection: undefined } }, "SUBSCRIPTION_REQUIRED");
  deny({ subscription: { ...subscription, isCurrent: "true" } }, "SUBSCRIPTION_REQUIRED");
});

test("scheduled cancellation keeps verified access until the exact expiry boundary", () => {
  const canceled = { ...subscription, cancelAtPeriodEnd: true };
  assert.equal(evaluateBillingAccess(input({ subscription: canceled })).allowed, true);
  deny({ subscription: canceled, now: Date.parse(canceled.accessExpiresAt) }, "BILLING_SYNC_PENDING");
});

test("access starts inclusively and ends exclusively", () => {
  assert.equal(evaluateBillingAccess(input({
    now: Date.parse(subscription.accessStartsAt),
    subscription: { ...subscription, verifiedAt: subscription.accessStartsAt },
  })).allowed, true);
  deny({ now: Date.parse(subscription.accessStartsAt) - 1 }, "BILLING_SYNC_PENDING");
  deny({ now: Date.parse(subscription.accessExpiresAt) }, "BILLING_SYNC_PENDING");
});

test("missing, malformed, naive, future-verification or reversed dates are rejected", () => {
  for (const value of [null, "not-a-date", "2026-10-01", "2026-10-01T00:00:00", "2026-02-30T00:00:00Z"]) {
    deny({ subscription: { ...subscription, accessStartsAt: value } }, "BILLING_SYNC_PENDING");
  }
  deny({ subscription: { ...subscription, verifiedAt: null } }, "BILLING_SYNC_PENDING");
  deny({ subscription: { ...subscription, verifiedAt: "2026-10-07T00:00:00Z" } }, "BILLING_SYNC_PENDING");
  deny({ subscription: { ...subscription, accessStartsAt: subscription.accessExpiresAt } }, "BILLING_SYNC_PENDING");
  deny({ now: NaN }, "BILLING_SYNC_PENDING");
});

test("explicit DB offsets and fractional timestamps preserve the access window", () => {
  assert.equal(evaluateBillingAccess(input({ subscription: {
    ...subscription, verifiedAt: "2026-10-06T19:00:00.123456+08:00",
    accessStartsAt: "2026-10-01T08:00:00+08:00", accessExpiresAt: "2026-11-01T08:00:00+08:00",
  } })).allowed, true);
});

test("unknown plan or catalog version cannot grant access", () => {
  deny({ subscription: { ...subscription, planId: "enterprise" } }, "PLAN_NOT_CONFIGURED");
  deny({ subscription: { ...subscription, planId: null } }, "PLAN_NOT_CONFIGURED");
  deny({ subscription: { ...subscription, catalogVersion: "unverified-version" } }, "PLAN_NOT_CONFIGURED");
});

test("unapproved or invalid limits cannot grant access", () => {
  deny({ approvedPlans: [{ ...plan, approved: false }] }, "PLAN_NOT_CONFIGURED");
  for (const quantity of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined]) {
    deny({ approvedPlans: [{ ...plan, limits: { ...plan.limits, images: quantity } }] }, "PLAN_NOT_CONFIGURED");
  }
  deny({ approvedPlans: [{ ...plan, workspaceLimit: -1 }] }, "PLAN_NOT_CONFIGURED");
  deny({ approvedPlans: [{ ...plan, limits: null }] }, "PLAN_NOT_CONFIGURED");
});

test("cloud rendering must be explicitly enabled by the approved offer", () => {
  deny({ feature: "cloud_render" }, "FEATURE_UNAVAILABLE");
  assert.equal(evaluateBillingAccess(input({
    feature: "cloud_render", approvedPlans: [{ ...plan, features: ["generation", "cloud_render"] }],
  })).allowed, true);
});

test("evaluating access preserves all input records", () => {
  const request = Object.freeze(input());
  const before = JSON.stringify(request);
  evaluateBillingAccess(request);
  assert.equal(JSON.stringify(request), before);
});
