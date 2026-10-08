import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./import-typescript.mjs";
import { plan, now } from "./server-fixtures.mjs";

const { projectStripeSubscription } = await importTypeScript(new URL("../../src/server/billing/subscription-policy.ts", import.meta.url));
const start = Date.parse("2026-10-01T00:00:00Z") / 1000;
const end = Date.parse("2026-11-01T00:00:00Z") / 1000;
const offer = { planId: "creator", catalogVersion: "fixture-v1", interval: "month", mode: "test",
  priceId: "price_fixture", amount: 4900, currency: "usd", approved: true };
const price = { id: "price_fixture", active: true, livemode: false, unit_amount: 4900, currency: "usd", billing_scheme: "per_unit",
  recurring: { interval: "month", interval_count: 1, usage_type: "licensed" } };
const subscription = { id: "sub_fixture", customer: "cus_fixture", livemode: false, status: "active", pause_collection: null,
  cancel_at_period_end: false, trial_end: null, latest_invoice: "in_fixture", metadata: {},
  items: { has_more: false, data: [{ id: "si_fixture", price, quantity: 1, current_period_start: start, current_period_end: end }] } };
const invoice = { id: "in_fixture", customer: "cus_fixture", livemode: false, status: "paid", amount_remaining: 0, currency: "usd",
  parent: { subscription_details: { subscription: "sub_fixture" } }, lines: { has_more: false, data: [
    { parent: { subscription_item_details: { subscription: "sub_fixture", subscription_item: "si_fixture", proration: false } },
      pricing: { price_details: { price: "price_fixture" } }, quantity: 1, period: { start, end } },
  ] } };
const project = (overrides = {}) => projectStripeSubscription({ subscription, invoice, customerId: "cus_fixture", mode: "test",
  offers: [offer], plans: [plan], now, ...overrides });

test("verified paid recurring item grants only the current monthly window", () => {
  const state = project();
  assert.equal(state.projection.accessStartsAt, "2026-10-01T00:00:00.000Z");
  assert.equal(state.projection.accessExpiresAt, "2026-11-01T00:00:00.000Z");
  assert.deepEqual(state.limits, plan.limits);
  assert.equal(state.window.index, 0);
});

test("active status or checkout completion alone cannot grant unpaid renewal access", () => {
  for (const value of [null, { ...invoice, status: "open" }, { ...invoice, amount_remaining: 4900 },
    { ...invoice, id: "in_previous_cycle" }, { ...invoice, customer: "cus_other" }, { ...invoice, livemode: true },
    { ...invoice, parent: { subscription_details: { subscription: "sub_other" } } }]) {
    const state = project({ invoice: value });
    assert.equal(state.projection.accessExpiresAt, null);
    assert.equal(state.limits, null);
  }
});

test("invoice lines must prove the exact item/price and cover the whole current cycle", () => {
  const original = invoice.lines.data[0];
  for (const line of [
    { ...original, period: { start, end: end - 1 } },
    { ...original, pricing: { price_details: { price: "price_other" } } },
    { ...original, parent: { subscription_item_details: { ...original.parent.subscription_item_details, proration: true } } },
    { ...original, parent: { subscription_item_details: { ...original.parent.subscription_item_details, subscription_item: "si_other" } } },
  ]) {
    assert.equal(project({ invoice: { ...invoice, lines: { has_more: false, data: [line] } } }).projection.accessExpiresAt, null);
  }
  assert.equal(project({ invoice: { ...invoice, lines: { ...invoice.lines, has_more: true } } }).limits, null);
});

test("trialing, past-due, canceled and collection-paused projections revoke access without deleting usage", () => {
  for (const changes of [{ status: "trialing" }, { status: "past_due" }, { status: "canceled" }, { pause_collection: { behavior: "void" } }]) {
    const state = project({ subscription: { ...subscription, ...changes } });
    assert.equal(state.projection.accessExpiresAt, null);
    assert.equal(state.limits, null);
  }
});

test("scheduled cancellation preserves paid-through rights and archived prices don't erase them", () => {
  assert.equal(project({ subscription: { ...subscription, cancel_at_period_end: true } }).projection.accessExpiresAt,
    "2026-11-01T00:00:00.000Z");
  const archived = { ...subscription, items: { ...subscription.items, data: [{ ...subscription.items.data[0], price: { ...price, active: false } }] } };
  assert.equal(project({ subscription: archived }).projection.planId, "creator");
});

test("unknown or unapproved catalog terms cannot grant a plan or monthly allowance", () => {
  for (const changes of [{ offers: [] }, { plans: [] }, { offers: [{ ...offer, approved: false }] },
    { offers: [{ ...offer, amount: 1 }] }, { offers: [offer, offer] }]) {
    const state = project(changes);
    assert.equal(state.projection.planId, null);
    assert.equal(state.projection.accessExpiresAt, null);
    assert.equal(state.limits, null);
  }
});

test("wrong customers, modes, quantities and unsupported recurring shapes fail closed", () => {
  for (const changes of [{ customer: "cus_other" }, { livemode: true },
    { items: { ...subscription.items, has_more: true } },
    { items: { has_more: false, data: [{ ...subscription.items.data[0], quantity: 2 }] } },
  ]) assert.throws(() => project({ subscription: { ...subscription, ...changes } }));
});

test("annual paid invoice creates one anchored monthly window, not twelve months of credits", () => {
  const annualStart = Date.parse("2026-01-31T00:00:00Z") / 1000;
  const annualEnd = Date.parse("2027-01-31T00:00:00Z") / 1000;
  const annualSubscription = { ...subscription, items: { ...subscription.items,
    data: [{ ...subscription.items.data[0], current_period_start: annualStart, current_period_end: annualEnd,
      price: { ...price, recurring: { ...price.recurring, interval: "year" } } }] } };
  const annualInvoice = { ...invoice, lines: { ...invoice.lines, data: [{ ...invoice.lines.data[0], period: { start: annualStart, end: annualEnd } }] } };
  const state = project({ subscription: annualSubscription, invoice: annualInvoice, offers: [{ ...offer, interval: "year" }] });
  assert.deepEqual(state.window, { startsAt: "2026-09-30T00:00:00.000Z", endsAt: "2026-10-31T00:00:00.000Z", index: 8 });
  assert.deepEqual(state.limits, plan.limits);
});
