import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./import-typescript.mjs";

const options = { serverOnly: true };
const { isBillingRuntimeEnabled, createRequestDependencies } = await importTypeScript(new URL("../../src/server/billing/runtime.ts", import.meta.url), options);
const { createStripeBillingClient, BILLING_STRIPE_API_VERSION } = await importTypeScript(new URL("../../src/server/billing/stripe-gateway.ts", import.meta.url), options);

test("even an explicit runtime flag cannot approve a provisional catalog", () => {
  const previous = process.env.BILLING_ENABLED;
  try {
    process.env.BILLING_ENABLED = "true";
    assert.equal(isBillingRuntimeEnabled(), false);
    assert.throws(() => createRequestDependencies({}), (error) => error.code === "BILLING_DISABLED");
  } finally {
    if (previous === undefined) delete process.env.BILLING_ENABLED;
    else process.env.BILLING_ENABLED = previous;
  }
});

test("new Stripe client refuses missing/placeholder/mismatched-mode keys without fallback", () => {
  for (const key of ["", "sk_test_dummy", "placeholder", "pk_test_publicNotSecret12345", "sk_live_syntheticButWrongMode12345"]) {
    assert.throws(() => createStripeBillingClient(key, "test"), (error) => error.code === "BILLING_UNAVAILABLE");
  }
});

test("new Stripe client uses the installed SDK API contract without a type cast", () => {
  const stripe = createStripeBillingClient("sk_test_syntheticOfflineKey123456789", "test");
  assert.equal(stripe.getApiField("version"), BILLING_STRIPE_API_VERSION);
});
