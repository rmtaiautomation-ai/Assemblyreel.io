import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./import-typescript.mjs";
import { account, actorId, otherActorId, snapshot, billingFixture, resource, usage, plan } from "./server-fixtures.mjs";

const options = { serverOnly: true };
const { authorizeBillingResource } = await importTypeScript(new URL("../../src/server/billing/authorization.ts", import.meta.url), options);
const { reserveUsage } = await importTypeScript(new URL("../../src/server/billing/usage.ts", import.meta.url), options);
const { fingerprintBillingInput } = await importTypeScript(new URL("../../src/server/billing/fingerprint.ts", import.meta.url), options);
const rejectsCode = (action, code) => assert.rejects(action, (error) => error.code === code && error.message === code);

test("disabled runtime stops before auth or DB work", async () => {
  const { dependencies, calls } = billingFixture({ enabled: false });
  await rejectsCode(() => authorizeBillingResource(dependencies, resource), "BILLING_DISABLED");
  assert.deepEqual(calls, []);
});

test("signed-out and malformed actors cannot reach reservation", async () => {
  for (const actor of [null, { id: "forged-browser-flag" }]) {
    const { dependencies, calls } = billingFixture({ verifyActor: async () => actor });
    await rejectsCode(() => reserveUsage(dependencies, resource, usage), "AUTH_REQUIRED");
    assert.deepEqual(calls, []);
  }
});

test("resource and billing-account ownership both must match the verified actor", async () => {
  for (const repository of [
    { getResourceOwner: async () => otherActorId },
    { getResourceOwner: async () => null },
    { getAccountForActor: async () => ({ ...account, ownerId: otherActorId }) },
  ]) {
    const { dependencies, calls } = billingFixture({ repository });
    await rejectsCode(() => reserveUsage(dependencies, resource, usage), "OWNERSHIP_REQUIRED");
    assert.equal(calls.some(([name]) => name === "reserve"), false);
  }
});

test("missing, historical, wrong-account, unknown-plan and paused projections fail closed", async () => {
  for (const [value, code] of [
    [null, "SUBSCRIPTION_REQUIRED"], [{ ...snapshot, isCurrent: false }, "SUBSCRIPTION_REQUIRED"],
    [{ ...snapshot, accountId: otherActorId }, "BILLING_UNAVAILABLE"],
    [{ ...snapshot, catalogVersion: "unapproved" }, "PLAN_NOT_CONFIGURED"],
    [{ ...snapshot, pauseCollection: true }, "SUBSCRIPTION_REQUIRED"],
  ]) {
    const { dependencies, calls } = billingFixture({ repository: { getCurrentSubscription: async () => value } });
    await rejectsCode(() => reserveUsage(dependencies, resource, usage), code);
    assert.equal(calls.some(([name]) => name === "reserve"), false);
  }
});

test("valid reservation derives account, actor, catalog and fingerprint on the server", async () => {
  const { dependencies, calls } = billingFixture();
  await reserveUsage(dependencies, resource, usage);
  const input = calls.find(([name]) => name === "reserve")[1];
  assert.equal(input.actorId, actorId);
  assert.equal(input.accountId, account.id);
  assert.equal(input.catalogVersion, plan.version);
  assert.match(input.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(input.resourceId, resource.id);
});

test("malformed resources, quantities and concurrency caps cannot reach the database RPC", async () => {
  for (const input of [{ items: {} }, { items: { unknown: 1 } }, { items: { images: -1 } },
    { items: { images: 1.1 } }, { items: { images: Number.MAX_SAFE_INTEGER + 1 } }, { operationKey: "short" }]) {
    const { dependencies, calls } = billingFixture();
    await rejectsCode(() => reserveUsage(dependencies, resource, { ...usage, ...input }), "INVALID_RESERVATION");
    assert.deepEqual(calls, []);
  }
  await rejectsCode(() => reserveUsage(billingFixture({ maxPending: 0 }).dependencies, resource, usage), "INVALID_RESERVATION");
  await rejectsCode(() => authorizeBillingResource(billingFixture().dependencies, { ...resource, kind: "arbitrary-table" }), "INVALID_REQUEST");
});

test("unavailable features and costs exceeding approved limits are rejected before reservation", async () => {
  const { dependencies, calls } = billingFixture();
  await rejectsCode(() => reserveUsage(dependencies, resource, usage, "cloud_render"), "FEATURE_UNAVAILABLE");
  await rejectsCode(() => reserveUsage(dependencies, resource, { ...usage, items: { images: 11 } }), "LIMIT_REACHED");
  assert.equal(calls.some(([name]) => name === "reserve"), false);
});

test("fingerprints are stable across object ordering but bind actual inputs and resource kind", () => {
  assert.equal(fingerprintBillingInput({ a: 1, b: { c: true } }), fingerprintBillingInput({ b: { c: true }, a: 1 }));
  assert.notEqual(fingerprintBillingInput({ prompt: "one" }), fingerprintBillingInput({ prompt: "two" }));
  assert.notEqual(fingerprintBillingInput({ kind: "project", id: resource.id }), fingerprintBillingInput({ kind: "media", id: resource.id }));
  for (const input of [NaN, undefined, new Date(), { prompt: "x".repeat(256_001) }]) {
    assert.throws(() => fingerprintBillingInput(input), (error) => error.code === "INVALID_REQUEST");
  }
});
