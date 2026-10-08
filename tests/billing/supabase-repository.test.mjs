import assert from "node:assert/strict";
import { test } from "node:test";
import { importTypeScript } from "./import-typescript.mjs";
import { actorId, accountId, resourceId, operationId, account } from "./server-fixtures.mjs";

const { createBillingRepository } = await importTypeScript(new URL("../../src/server/billing/supabase-repository.ts", import.meta.url), { serverOnly: true });

function clientFixture(respond) {
  const calls = [];
  const client = {
    from(table) {
      const filters = {};
      let columns;
      const chain = {
        select(value) { columns = value; return chain; },
        eq(key, value) { filters[key] = value; return chain; },
        async maybeSingle() { const call = { table, columns, filters }; calls.push(call); return respond(call); },
      };
      return chain;
    },
    async rpc(name, input) { const call = { rpc: name, input }; calls.push(call); return respond(call); },
  };
  return { repository: createBillingRepository(client), calls };
}

test("account lookup is scoped to verified owner and checks the row contract", async () => {
  const { repository, calls } = clientFixture(() => ({ data: { id: accountId, user_id: actorId,
    enabled: true, stripe_mode: "test", stripe_customer_id: "cus_fixture" }, error: null }));
  assert.deepEqual(await repository.getAccountForActor(actorId), account);
  assert.deepEqual(calls[0].filters, { user_id: actorId });
});

test("database errors are sanitized and malformed rows never become authority", async () => {
  for (const response of [
    { data: null, error: { code: "XX000", message: "secret-key-and-customer-data" } },
    { data: { enabled: "true" }, error: null },
  ]) {
    const { repository } = clientFixture(() => response);
    await assert.rejects(() => repository.getAccountForActor(actorId),
      (error) => error.code === "BILLING_UNAVAILABLE" && !error.message.includes("secret"));
  }
});

test("scene ownership follows scene -> project -> workspace and does not trust the caller", async () => {
  const { repository, calls } = clientFixture(({ table }) => ({ error: null, data:
    table === "scenes" ? { project_id: resourceId } : table === "video_projects" ? { workspace_id: accountId } : { user_id: actorId } }));
  assert.equal(await repository.getResourceOwner({ kind: "scene", id: operationId }), actorId);
  assert.deepEqual(calls.map(({ table, filters }) => [table, filters.id]),
    [["scenes", operationId], ["video_projects", resourceId], ["workspaces", accountId]]);
});

test("missing resource relationships fail closed and stop further queries", async () => {
  const { repository, calls } = clientFixture(() => ({ error: null, data: null }));
  assert.equal(await repository.getResourceOwner({ kind: "media", id: resourceId }), null);
  assert.equal(calls.length, 1);
});

test("current subscription lookup is scoped by account, mode and current marker", async () => {
  const { repository, calls } = clientFixture(() => ({ error: null, data: null }));
  assert.equal(await repository.getCurrentSubscription(account), null);
  assert.deepEqual(calls[0].filters, { account_id: accountId, stripe_mode: "test", is_current: true });
});

test("reservation forwards only server contract fields and preserves known SQL errors", async () => {
  const { repository, calls } = clientFixture(() => ({ data: null, error: { code: "P0001", message: "LIMIT_REACHED" } }));
  await assert.rejects(() => repository.reserve({ accountId, actorId, resourceId, operationKey: "fixture-operation",
    fingerprint: "a".repeat(64), catalogVersion: "fixture-v1", items: { images: 1 }, maxPending: 4 }), (error) => error.code === "LIMIT_REACHED");
  assert.equal(calls[0].rpc, "reserve_billing_operation");
  assert.deepEqual(calls[0].input.p_items, { images: 1 });
});

test("settlement checks the RPC response shape rather than assuming an update succeeded", async () => {
  const { repository } = clientFixture(() => ({ data: {}, error: null }));
  await assert.rejects(() => repository.settle({ accountId, operationId, outcome: "provider_completed" }), (error) => error.code === "BILLING_UNAVAILABLE");
});
