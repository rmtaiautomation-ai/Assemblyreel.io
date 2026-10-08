import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./import-typescript.mjs";
import { billingFixture, resource, usage, operationId, otherActorId } from "./server-fixtures.mjs";

const { runMeteredGeneration } = await importTypeScript(new URL("../../src/server/generation/metered-generation.ts", import.meta.url), { serverOnly: true });

test("rejected auth, ownership, subscription and quota requests make zero provider calls", async () => {
  for (const overrides of [
    { enabled: false }, { verifyActor: async () => null },
    { repository: { getResourceOwner: async () => otherActorId } },
    { repository: { getCurrentSubscription: async () => null } },
    { repository: { reserve: async () => { throw new Error("LIMIT_REACHED"); } } },
  ]) {
    const { dependencies } = billingFixture(overrides);
    let starts = 0;
    await assert.rejects(() => runMeteredGeneration({ dependencies, resource, usage, start: async () => { starts++; } }));
    assert.equal(starts, 0);
  }
});

test("provider start happens only after reserve and a durable uncertainty write", async () => {
  const { dependencies, calls } = billingFixture();
  const result = await runMeteredGeneration({ dependencies, resource, usage,
    start: async (id) => { calls.push(["provider", id]); return { outcome: "provider_completed", provider: "fixture", value: "output" }; } });
  assert.equal(result.kind, "result");
  assert.deepEqual(calls.filter(([name]) => ["reserve", "settle", "provider"].includes(name)).map(([name]) => name),
    ["reserve", "settle", "provider", "settle"]);
  const settlements = calls.filter(([name]) => name === "settle").map(([, value]) => value.outcome);
  assert.deepEqual(settlements, ["submission_uncertain", "provider_completed"]);
});

test("all replay states return their operation without resubmitting or settling", async () => {
  for (const state of ["reserved", "submitted", "unknown", "committed", "released"]) {
    const { dependencies, calls } = billingFixture({ repository: { reserve: async () => ({ id: operationId, state, created: false }) } });
    let starts = 0;
    const result = await runMeteredGeneration({ dependencies, resource, usage, start: async () => { starts++; } });
    assert.equal(result.kind, "replay");
    assert.equal(starts, 0);
    assert.equal(calls.some(([name]) => name === "settle"), false);
  }
});

test("failure to persist uncertainty prevents provider submission", async () => {
  const { dependencies } = billingFixture({ repository: { settle: async () => { throw new Error("DB unavailable"); } } });
  let starts = 0;
  await assert.rejects(() => runMeteredGeneration({ dependencies, resource, usage, start: async () => { starts++; } }));
  assert.equal(starts, 0);
});

test("timeout or generic provider exception never releases or commits the reservation", async () => {
  const { dependencies, calls } = billingFixture();
  await assert.rejects(() => runMeteredGeneration({ dependencies, resource, usage,
    start: async () => { throw new Error("response lost after vendor accepted"); } }));
  assert.deepEqual(calls.filter(([name]) => name === "settle").map(([, value]) => value.outcome), ["submission_uncertain"]);
});

test("asynchronous acceptance persists the provider ID; confirmed no-work is the only release outcome", async () => {
  for (const result of [
    { outcome: "provider_accepted", provider: "fixture", requestId: "job-fixture", value: "pending" },
    { outcome: "no_work_confirmed", provider: "fixture", errorCode: "VALIDATION_REJECTED" },
    { outcome: "submission_uncertain", provider: "fixture", errorCode: "TIMEOUT" },
  ]) {
    const { dependencies, calls } = billingFixture();
    await runMeteredGeneration({ dependencies, resource, usage, start: async () => result });
    const last = calls.filter(([name]) => name === "settle").at(-1)[1];
    assert.equal(last.outcome, result.outcome);
    assert.equal(last.providerRequestId, result.requestId);
  }
});
