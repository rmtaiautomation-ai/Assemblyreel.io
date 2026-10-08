import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./import-typescript.mjs";
import { accountId, actorId, operationId } from "./server-fixtures.mjs";

const { createStripeBillingGateway } = await importTypeScript(new URL("../../src/server/billing/stripe-gateway.ts", import.meta.url), { serverOnly: true });
const offer = { planId: "creator", catalogVersion: "fixture-v1", interval: "month", mode: "test",
  priceId: "price_fixture", amount: 4900, currency: "usd", approved: true };

test("Stripe SDK checkout parameters use persisted identity/idempotency and no free trial", async () => {
  let parameters;
  let options;
  const gateway = createStripeBillingGateway({ checkout: { sessions: {
    async create(input, requestOptions) {
      parameters = input; options = requestOptions;
      return { id: "cs_test_fixture", url: "https://checkout.stripe.com/c/pay/fixture", livemode: false,
        expires_at: Math.floor(Date.now() / 1000) + 3600 };
    },
  } } }, "test");
  await gateway.createCheckout({ accountId, attemptId: operationId, customerId: "cus_fixture", offer, origin: "https://app.example.test" });
  assert.equal(options.idempotencyKey, `billing-checkout:test:${operationId}`);
  assert.deepEqual(parameters.line_items, [{ price: "price_fixture", quantity: 1 }]);
  assert.equal(parameters.customer, "cus_fixture");
  assert.equal(parameters.client_reference_id, operationId);
  assert.equal(parameters.metadata.billing_account_id, accountId);
  assert.deepEqual(parameters.subscription_data.metadata, parameters.metadata);
  assert.equal(parameters.subscription_data.trial_period_days, undefined);
  assert.equal(parameters.allow_promotion_codes, false);
});

test("customer creation is keyed by account/mode and the mapped customer metadata is verified", async () => {
  const calls = [];
  const gateway = createStripeBillingGateway({ customers: {
    async create(input, options) { calls.push([input, options]); return { id: "cus_fixture", livemode: false }; },
    async retrieve() { return { id: "cus_fixture", livemode: false, metadata: { billing_account_id: accountId } }; },
  } }, "test");
  await gateway.createCustomer(accountId, { id: actorId, email: "fixture@example.test" });
  assert.equal(calls[0][1].idempotencyKey, `billing-customer:test:${accountId}`);
  await gateway.verifyCustomer("cus_fixture", accountId);
  await assert.rejects(() => gateway.verifyCustomer("cus_fixture", actorId), (error) => error.code === "OWNERSHIP_REQUIRED");
});

test("subscription lookup is bounded and truncated lists block another purchase", async () => {
  const gateway = createStripeBillingGateway({ subscriptions: {
    async list(input) { assert.equal(input.limit, 100); return { has_more: true, data: [{ status: "canceled" }] }; },
  } }, "test");
  assert.equal(await gateway.hasNonTerminalSubscription("cus_fixture"), true);
});

test("Stripe price retrieval expands the product rather than assuming it is saleable", async () => {
  const gateway = createStripeBillingGateway({ prices: {
    async retrieve(id, input) {
      assert.deepEqual(input, { expand: ["product"] });
      return { id, livemode: false, active: true, product: { id: "prod_fixture", active: false }, unit_amount: 4900,
        currency: "usd", recurring: { interval: "month", interval_count: 1, usage_type: "licensed" }, billing_scheme: "per_unit" };
    },
  } }, "test");
  assert.equal((await gateway.getPrice("price_fixture")).productActive, false);
});
