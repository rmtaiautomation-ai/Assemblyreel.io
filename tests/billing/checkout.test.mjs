import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./import-typescript.mjs";
import { account, actorId, operationId, plan, now, otherActorId } from "./server-fixtures.mjs";

const { startBillingCheckout, startBillingPortal, assertCheckoutPrice } = await importTypeScript(
  new URL("../../src/server/billing/checkout.ts", import.meta.url), { serverOnly: true });
const offer = { planId: "creator", catalogVersion: "fixture-v1", interval: "month", mode: "test",
  priceId: "price_fixture", amount: 4900, currency: "usd", approved: true };
const price = { id: "price_fixture", mode: "test", active: true, productActive: true, amount: 4900, currency: "usd",
  interval: "month", intervalCount: 1, usageType: "licensed", billingScheme: "per_unit" };
const body = { planId: "creator", interval: "month", operationKey: "checkout-fixture" };
const session = { id: "cs_test_fixture", url: "https://checkout.stripe.com/c/pay/fixture", expiresAt: "2026-10-07T08:00:00Z" };

function checkoutFixture(overrides = {}) {
  const calls = [];
  const repository = {
    async getAccountForActor() { calls.push("account"); return account; },
    async begin(input) { calls.push(["begin", input]); return { id: operationId, state: "pending", created: true, url: null, expiresAt: null }; },
    async bindCustomer(...input) { calls.push(["bind", input]); },
    async ready(...input) { calls.push(["ready", input]); },
    async markUnknown(...input) { calls.push(["unknown", input]); },
    ...overrides.repository,
  };
  const stripe = {
    mode: "test",
    async getPrice() { calls.push("price"); return price; },
    async createCustomer(...input) { calls.push(["customer", input]); return "cus_created"; },
    async verifyCustomer(...input) { calls.push(["verify-customer", input]); },
    async hasNonTerminalSubscription() { calls.push("existing-subscriptions"); return false; },
    async createCheckout(input) { calls.push(["checkout", input]); return session; },
    async createPortal(...input) { calls.push(["portal", input]); return "https://billing.stripe.com/p/session/fixture"; },
    ...overrides.stripe,
  };
  return { calls, dependencies: { salesEnabled: true, portalEnabled: true,
    async verifyActor() { calls.push("actor"); return { id: actorId, email: "fixture@example.test" }; },
    approvedPlans: [plan], approvedOffers: [offer], siteOrigin: "https://app.example.test", now: () => now,
    ...overrides, stripe, repository } };
}

const rejected = (action, code) => assert.rejects(action, (error) => error.code === code);
const mutations = (calls) => calls.filter((call) => Array.isArray(call) && ["customer", "checkout", "portal"].includes(call[0]));

test("disabled sales make no auth, DB or Stripe calls", async () => {
  const { dependencies, calls } = checkoutFixture({ salesEnabled: false });
  await rejected(() => startBillingCheckout(dependencies, body), "BILLING_DISABLED");
  assert.deepEqual(calls, []);
});

test("checkout rejects raw price IDs, customer/user tampering and unavailable annual offers", async () => {
  for (const input of [{ priceId: "price_attack" }, { ...body, customerId: "cus_other" },
    { ...body, actorId: otherActorId }, { ...body, interval: "week" }]) {
    const { dependencies, calls } = checkoutFixture();
    await rejected(() => startBillingCheckout(dependencies, input), "INVALID_REQUEST");
    assert.deepEqual(calls, []);
  }
  const { dependencies, calls } = checkoutFixture();
  await rejected(() => startBillingCheckout(dependencies, { ...body, interval: "year" }), "PLAN_NOT_CONFIGURED");
  assert.deepEqual(mutations(calls), []);
});

test("auth, owner, activation, mode and missing-catalog failures make zero Stripe mutations", async () => {
  for (const [overrides, code] of [
    [{ verifyActor: async () => null }, "AUTH_REQUIRED"],
    [{ repository: { getAccountForActor: async () => ({ ...account, ownerId: otherActorId }) } }, "OWNERSHIP_REQUIRED"],
    [{ repository: { getAccountForActor: async () => ({ ...account, enabled: false }) } }, "BILLING_DISABLED"],
    [{ repository: { getAccountForActor: async () => null } }, "BILLING_SYNC_PENDING"],
    [{ stripe: { mode: "live" } }, "PLAN_NOT_CONFIGURED"],
    [{ approvedOffers: [] }, "PLAN_NOT_CONFIGURED"], [{ approvedPlans: [] }, "PLAN_NOT_CONFIGURED"],
  ]) {
    const { dependencies, calls } = checkoutFixture(overrides);
    await rejected(() => startBillingCheckout(dependencies, body), code);
    assert.deepEqual(mutations(calls), []);
  }
});

test("Stripe price must match every approved term before attempt/session creation", async () => {
  for (const changes of [{ mode: "live" }, { active: false }, { productActive: false }, { amount: 1 },
    { currency: "eur" }, { interval: "year" }, { intervalCount: 2 }, { usageType: "metered" }, { billingScheme: "tiered" }]) {
    assert.throws(() => assertCheckoutPrice(offer, { ...price, ...changes }), (error) => error.code === "PLAN_NOT_CONFIGURED");
  }
  const { dependencies, calls } = checkoutFixture({ stripe: { getPrice: async () => ({ ...price, amount: 1 }) } });
  await rejected(() => startBillingCheckout(dependencies, body), "PLAN_NOT_CONFIGURED");
  assert.equal(calls.some((call) => call[0] === "begin"), false);
});

test("fresh checkout uses trusted terms and persists its attempt before Stripe creation", async () => {
  const { dependencies, calls } = checkoutFixture();
  assert.deepEqual(await startBillingCheckout(dependencies, body), { url: session.url });
  const ordered = calls.filter(Array.isArray).map(([name]) => name);
  assert.deepEqual(ordered, ["begin", "verify-customer", "checkout", "ready"]);
  const input = calls.find((call) => call[0] === "checkout")[1];
  assert.equal(input.customerId, account.stripeCustomerId);
  assert.deepEqual(input.offer, offer);
  assert.equal(input.origin, "https://app.example.test");
});

test("a new customer is verified and bound before checkout creation", async () => {
  const { dependencies, calls } = checkoutFixture({ repository: { getAccountForActor: async () => ({ ...account, stripeCustomerId: null }) } });
  await startBillingCheckout(dependencies, body);
  assert.deepEqual(calls.filter(Array.isArray).map(([name]) => name), ["begin", "customer", "verify-customer", "bind", "checkout", "ready"]);
});

test("ready replay returns its original URL without additional customer/session creation", async () => {
  const { dependencies, calls } = checkoutFixture({ repository: { begin: async () => ({ id: operationId, state: "ready", created: false,
    url: session.url, expiresAt: session.expiresAt }) } });
  assert.deepEqual(await startBillingCheckout(dependencies, body), { url: session.url });
  assert.deepEqual(mutations(calls), []);
});

test("pending, unknown, expired, malformed and completed replays never blindly retry", async () => {
  for (const attempt of [
    ...["pending", "unknown", "expired", "complete"].map((state) => ({ state, url: null, expiresAt: null })),
    { state: "ready", url: session.url, expiresAt: "invalid" },
    { state: "ready", url: session.url, expiresAt: "2026-10-01T00:00:00Z" },
  ]) {
    const { dependencies, calls } = checkoutFixture({ repository: { begin: async () => ({ id: operationId, created: false, ...attempt }) } });
    await rejected(() => startBillingCheckout(dependencies, body), "BILLING_SYNC_PENDING");
    assert.deepEqual(mutations(calls), []);
  }
});

test("Stripe timeouts and DB binding failures remain unknown and do not leak vendor errors", async () => {
  for (const overrides of [
    { stripe: { createCheckout: async () => { throw new Error("secret-token in Stripe error"); } } },
    { repository: { ready: async () => { throw new Error("sensitive DB error"); } } },
  ]) {
    const { dependencies, calls } = checkoutFixture(overrides);
    await rejected(() => startBillingCheckout(dependencies, body), "BILLING_UNAVAILABLE");
    assert.equal(calls.filter((call) => call[0] === "unknown").length, 1);
  }
});

test("existing nonterminal Stripe subscriptions prevent duplicate checkout", async () => {
  const { dependencies, calls } = checkoutFixture({ stripe: { hasNonTerminalSubscription: async () => true } });
  await rejected(() => startBillingCheckout(dependencies, body), "OPERATION_CONFLICT");
  assert.equal(calls.some((call) => call[0] === "checkout"), false);
});

test("unsafe origin or returned redirect cannot reach customers", async () => {
  for (const siteOrigin of ["https://user:password@app.example.test", "https://app.example.test/path", "http://remote.example.test"]) {
    const { dependencies, calls } = checkoutFixture({ siteOrigin });
    await rejected(() => startBillingCheckout(dependencies, body), "PLAN_NOT_CONFIGURED");
    assert.deepEqual(calls, []);
  }
  const { dependencies } = checkoutFixture({ stripe: { createCheckout: async () => ({ ...session, url: "https://attacker.example.test" }) } });
  await rejected(() => startBillingCheckout(dependencies, body), "BILLING_UNAVAILABLE");
});

test("portal remains available to mapped customers during a sales/access shutdown", async () => {
  const { dependencies, calls } = checkoutFixture({ salesEnabled: false,
    repository: { getAccountForActor: async () => ({ ...account, enabled: false }) } });
  assert.deepEqual(await startBillingPortal(dependencies), { url: "https://billing.stripe.com/p/session/fixture" });
  assert.equal(calls.some((call) => call[0] === "portal"), true);
  assert.equal(calls.some((call) => call[0] === "checkout"), false);
});

test("portal rejects missing customers, ownership mismatches and disabled deployment", async () => {
  for (const [overrides, code] of [
    [{ portalEnabled: false }, "BILLING_DISABLED"],
    [{ repository: { getAccountForActor: async () => ({ ...account, stripeCustomerId: null }) } }, "SUBSCRIPTION_REQUIRED"],
    [{ stripe: { verifyCustomer: async () => { throw new Error("vendor error"); } } }, "BILLING_UNAVAILABLE"],
  ]) {
    const { dependencies, calls } = checkoutFixture(overrides);
    await rejected(() => startBillingPortal(dependencies), code);
    assert.equal(calls.some((call) => call[0] === "portal"), false);
  }
});
