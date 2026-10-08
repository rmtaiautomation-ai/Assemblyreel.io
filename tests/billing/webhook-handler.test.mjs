import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./import-typescript.mjs";
import { account } from "./server-fixtures.mjs";

const { reconcileBillingEvent } = await importTypeScript(new URL("../../src/server/billing/webhook-handler.ts", import.meta.url), { serverOnly: true });
const event = { id: "evt_fixture", mode: "test", type: "invoice.paid", objectId: "in_fixture" };
const state = { projection: { customerId: "cus_fixture", stripeSubscriptionId: "sub_fixture" }, window: null, limits: null };

function fixture(overrides = {}) {
  const calls = [];
  const repository = {
    async record() { calls.push("receipt"); }, async findAccount() { calls.push("account"); return account; },
    async claim() { calls.push("claim"); return { claimed: true, token: "fixture-token" }; },
    async apply(...args) { calls.push(["apply", args]); }, async fail(...args) { calls.push(["fail", args]); },
    ...overrides.repository,
  };
  return { calls, dependencies: { async resolve() { calls.push("resolve"); return { customerId: "cus_fixture", subscriptionId: "sub_fixture" }; },
    async retrieveState() { calls.push("fresh-state"); return state; }, ...overrides, repository } };
}

test("receipt persists before resolution and authoritative Stripe retrieval occurs after the lease", async () => {
  const { dependencies, calls } = fixture();
  assert.equal(await reconcileBillingEvent(dependencies, event), "processed");
  assert.deepEqual(calls.map((call) => Array.isArray(call) ? call[0] : call),
    ["receipt", "resolve", "account", "claim", "fresh-state", "apply"]);
});

test("busy accounts request a retry and completed events don't retrieve/apply again", async () => {
  for (const status of ["busy", "processed", "ignored"]) {
    const { dependencies, calls } = fixture({ repository: { claim: async () => ({ claimed: false, status }) } });
    if (status === "busy") await assert.rejects(() => reconcileBillingEvent(dependencies, event), (error) => error.code === "BILLING_SYNC_PENDING");
    else assert.equal(await reconcileBillingEvent(dependencies, event), "duplicate");
    assert.equal(calls.some((call) => call === "fresh-state" || call[0] === "apply"), false);
  }
});

test("receipt DB failure prevents any downstream work", async () => {
  const { dependencies, calls } = fixture({ repository: { record: async () => { throw new Error("DB down"); } } });
  await assert.rejects(() => reconcileBillingEvent(dependencies, event));
  assert.deepEqual(calls, []);
});

test("unknown customers/modes and mismatched projections cannot publish entitlements", async () => {
  const { dependencies, calls } = fixture({ repository: { findAccount: async () => null } });
  await assert.rejects(() => reconcileBillingEvent(dependencies, event), (error) => error.code === "BILLING_SYNC_PENDING");
  assert.equal(calls.includes("claim"), false);
  const wrong = fixture({ retrieveState: async () => ({ ...state, projection: { ...state.projection, customerId: "cus_other" } }) });
  await assert.rejects(() => reconcileBillingEvent(wrong.dependencies, event), (error) => error.code === "OWNERSHIP_REQUIRED");
  assert.equal(wrong.calls.some((call) => call[0] === "apply"), false);
});

test("Stripe or atomic-apply failure records a sanitized retryable error, never processed", async () => {
  for (const overrides of [
    { retrieveState: async () => { throw new Error("secret vendor payload"); } },
    { repository: { apply: async () => { throw new Error("DB outage"); } } },
  ]) {
    const { dependencies, calls } = fixture(overrides);
    await assert.rejects(() => reconcileBillingEvent(dependencies, event), (error) => error.code === "BILLING_UNAVAILABLE");
    const failed = calls.find((call) => call[0] === "fail");
    assert.equal(failed[1].at(-1), "BILLING_UNAVAILABLE");
  }
});
