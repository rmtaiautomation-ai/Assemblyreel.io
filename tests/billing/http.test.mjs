import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./import-typescript.mjs";

const options = { serverOnly: true };
const { readBillingBody, readCheckoutJson, billingErrorResponse } = await importTypeScript(new URL("../../src/server/billing/http.ts", import.meta.url), options);
const { handleCheckoutRequest, handlePortalRequest } = await importTypeScript(new URL("../../src/server/billing/request-handlers.ts", import.meta.url), options);
const { handleBillingWebhook } = await importTypeScript(new URL("../../src/server/billing/webhook-request.ts", import.meta.url), options);
const { BillingError } = await importTypeScript(new URL("../../src/server/billing/errors.ts", import.meta.url));

const request = (body, headers = {}) => new Request("https://app.example.test/api/stripe/checkout", {
  method: "POST", headers: { origin: "https://app.example.test", "content-type": "application/json", ...headers }, body,
});

test("billing responses are JSON, private/no-store, and redact unknown errors", async () => {
  const response = billingErrorResponse(new Error("secret key or DB payload"));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await response.json(), { error: "BILLING_UNAVAILABLE", code: "BILLING_UNAVAILABLE" });
});

test("typed billing errors map to useful HTTP status codes without raw messages", async () => {
  for (const [code, status] of [["AUTH_REQUIRED", 401], ["OWNERSHIP_REQUIRED", 403], ["INVALID_REQUEST", 400],
    ["LIMIT_REACHED", 429], ["OPERATION_CONFLICT", 409], ["BILLING_DISABLED", 503]]) {
    assert.equal(billingErrorResponse(new BillingError(code)).status, status);
  }
});

test("body bounds apply to actual stream bytes, not just a supplied content length", async () => {
  await assert.rejects(() => readBillingBody(request("12345", { "content-length": "1" }), 4), (error) => error.code === "INVALID_REQUEST");
  await assert.rejects(() => readBillingBody(request("1", { "content-length": "9999" }), 4), (error) => error.code === "INVALID_REQUEST");
  assert.equal(await readBillingBody(request("é"), 2), "é");
  await assert.rejects(() => readBillingBody(request("é"), 1), (error) => error.code === "INVALID_REQUEST");
});

test("checkout requires valid JSON content type, bounded JSON and valid UTF-8", async () => {
  assert.deepEqual(await readCheckoutJson(request('{"planId":"creator"}')), { planId: "creator" });
  for (const value of [request("invalid JSON"), request("{}", { "content-type": "text/plain" }),
    request('"' + "x".repeat(8192) + '"'), request(new Uint8Array([255]))]) {
    await assert.rejects(() => readCheckoutJson(value), (error) => error.code === "INVALID_REQUEST");
  }
});

test("disabled checkout/portal contexts return disabled before parsing or using providers", async () => {
  const context = async () => { throw new BillingError("BILLING_DISABLED"); };
  for (const handler of [handleCheckoutRequest, handlePortalRequest]) {
    const response = await handler(request("malformed"), context);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, "BILLING_DISABLED");
  }
});

test("cross-origin checkout and portal requests fail before auth or service calls", async () => {
  let verified = 0;
  const context = async () => ({ siteOrigin: "https://app.example.test", verifyActor: async () => { verified++; } });
  for (const handler of [handleCheckoutRequest, handlePortalRequest]) {
    const response = await handler(request("{}", { origin: "https://attacker.example.test" }), context);
    assert.equal(response.status, 403);
  }
  assert.equal(verified, 0);
});

test("webhook signature failure prevents all database/reconciliation calls", async () => {
  let writes = 0;
  const response = await handleBillingWebhook(request("original-bytes"), () => ({
    verify: () => { throw new BillingError("INVALID_REQUEST"); },
    ignore: async () => { writes++; }, dependencies: { repository: { record: async () => { writes++; } } },
  }));
  assert.equal(response.status, 400);
  assert.equal(writes, 0);
});

test("verified unsupported webhooks persist an ignored receipt without publishing access", async () => {
  const calls = [];
  const response = await handleBillingWebhook(request("original-bytes"), () => ({
    verify: (body) => { calls.push(body); return { event: { id: "evt_fixture" }, supported: false }; },
    ignore: async (event) => { calls.push(event.id); }, dependencies: {},
  }));
  assert.deepEqual(await response.json(), { received: true, status: "ignored" });
  assert.deepEqual(calls, ["original-bytes", "evt_fixture"]);
});
