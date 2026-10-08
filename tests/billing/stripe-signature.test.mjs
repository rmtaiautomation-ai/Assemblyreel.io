import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
import { importTypeScript } from "./import-typescript.mjs";

const { verifyBillingWebhook } = await importTypeScript(new URL("../../src/server/billing/stripe-webhooks.ts", import.meta.url), { serverOnly: true });
// Synthetic values only. These tests use Stripe's LOCAL signature utilities;
// no key is valid and no Stripe API requests occur.
const stripe = new Stripe("sk_test_notARealKeyJustLocalTests");
const secret = "whsec_notARealSigningSecretLocalTests";
const payload = { id: "evt_fixture", type: "invoice.paid", api_version: "2026-06-24.dahlia", livemode: false,
  data: { object: { id: "in_fixture" } } };
const signed = (overrides = {}) => {
  const body = JSON.stringify({ ...payload, ...overrides });
  return { stripe, secret, mode: "test", body,
    signature: stripe.webhooks.generateTestHeaderString({ payload: body, secret }) };
};

test("actual Stripe signature verification returns identifiers, not entitlement data", () => {
  assert.deepEqual(verifyBillingWebhook(signed()), { supported: true,
    event: { id: "evt_fixture", type: "invoice.paid", mode: "test", objectId: "in_fixture" } });
});

test("missing, forged, stale and reserialized signatures are rejected", () => {
  const valid = signed();
  const stale = stripe.webhooks.generateTestHeaderString({ payload: valid.body, secret, timestamp: Math.floor(Date.now() / 1000) - 1000 });
  for (const changes of [{ signature: null }, { signature: "forged" }, { signature: stale },
    { body: `${valid.body} ` }, { secret: "whsec_anotherSigningSecretLocalTests" }]) {
    assert.throws(() => verifyBillingWebhook({ ...valid, ...changes }), (error) => error.code === "INVALID_REQUEST");
  }
});

test("live-mode or endpoint/API-version mismatch fails closed", () => {
  for (const changes of [{ livemode: true }, { api_version: "2025-01-27.acacia" }]) {
    assert.throws(() => verifyBillingWebhook(signed(changes)), (error) => error.code === "PLAN_NOT_CONFIGURED");
  }
});

test("unsupported signed event types are identified without inventing subscription access", () => {
  assert.equal(verifyBillingWebhook(signed({ type: "customer.created" })).supported, false);
  assert.deepEqual(verifyBillingWebhook(signed({ type: "balance.available", data: { object: { object: "balance" } } })),
    { supported: false, event: { id: "evt_fixture", mode: "test", type: "balance.available", objectId: null } });
});
