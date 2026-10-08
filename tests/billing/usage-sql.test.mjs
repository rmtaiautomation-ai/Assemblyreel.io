import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

// Ephemeral real PostgreSQL, NOT Supabase or a multi-connection concurrency test.
const db = new PGlite();
const owner = "10000000-0000-0000-0000-000000000001";
const otherOwner = "10000000-0000-0000-0000-000000000002";
const account = "20000000-0000-0000-0000-000000000001";
const otherAccount = "20000000-0000-0000-0000-000000000002";
const subscription = "30000000-0000-0000-0000-000000000001";
const resource = "40000000-0000-0000-0000-000000000001";
const fingerprint = "a".repeat(64);

before(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
  `);
  for (const file of ["add-billing-accounts.sql", "add-billing-usage.sql", "add-billing-usage-functions.sql", "add-billing-usage-windows.sql", "add-billing-checkout.sql", "add-billing-webhook-functions.sql"]) {
    await db.exec(await readFile(new URL(`../../db/${file}`, import.meta.url), "utf8"));
  }
});

beforeEach(async () => {
  await db.exec(`RESET ROLE; TRUNCATE auth.users, public.billing_accounts CASCADE;`);
  await db.query("INSERT INTO auth.users(id) VALUES ($1), ($2)", [owner, otherOwner]);
  await db.query(`INSERT INTO public.billing_accounts(id, user_id, enabled, stripe_mode)
    VALUES ($1, $2, true, 'test'), ($3, $4, true, 'test')`, [account, owner, otherAccount, otherOwner]);
  await db.query(`INSERT INTO public.billing_subscriptions(id, account_id, stripe_mode,
    stripe_subscription_id, stripe_price_id, plan_id, catalog_version, status, billing_interval,
    is_current, access_starts_at, access_expires_at, verified_at)
    VALUES ($1, $2, 'test', 'sub_fixture', 'price_fixture', 'creator', 'fixture-v1', 'active', 'month',
      true, now() - interval '1 day', now() + interval '1 day', now() - interval '1 minute')`, [subscription, account]);
  await db.query(`INSERT INTO public.billing_usage_periods(account_id, subscription_id,
    window_start, window_end, metric, catalog_version, limit_quantity)
    SELECT $1, $2, now() - interval '1 day', now() + interval '1 day', metric, 'fixture-v1', 10
    FROM unnest(ARRAY['images', 'llm_tokens']) AS metric`, [account, subscription]);
  await db.exec("SET ROLE service_role");
});

after(async () => { await db.close(); });

async function reserve(items = { images: 1 }, overrides = {}) {
  const input = { account, actor: owner, resource, key: "operation-0001", fingerprint,
    version: "fixture-v1", maxPending: 4, ...overrides };
  const result = await db.query(`SELECT public.reserve_billing_operation($1, $2, $3, $4, $5, $6, $7, $8) AS result`,
    [input.account, input.actor, input.resource, input.key, input.fingerprint, input.version, JSON.stringify(items), input.maxPending]);
  return result.rows[0].result;
}

async function settle(id, outcome, overrides = {}) {
  const input = { account, provider: null, request: null, error: null, ...overrides };
  const result = await db.query(`SELECT public.settle_billing_operation($1, $2, $3, $4, $5, $6) AS result`,
    [input.account, id, outcome, input.provider, input.request, input.error]);
  return result.rows[0].result;
}

async function usage(metric = "images") {
  const result = await db.query(`SELECT used_quantity::integer AS used, reserved_quantity::integer AS reserved
    FROM public.billing_usage_periods WHERE account_id = $1 AND metric = $2`, [account, metric]);
  return result.rows[0];
}

function rejectsCode(action, code) {
  return assert.rejects(action, (error) => error.code === "P0001" && error.message === code);
}

test("actual migrations execute and the service role reserves all metrics", async () => {
  const operation = await reserve({ images: 2, llm_tokens: 3 });
  assert.equal(operation.created, true);
  assert.equal(operation.state, "reserved");
  assert.deepEqual(await usage(), { used: 0, reserved: 2 });
  assert.deepEqual(await usage("llm_tokens"), { used: 0, reserved: 3 });
});

test("a later metric rejection rolls back every counter, item and operation", async () => {
  await rejectsCode(() => reserve({ images: 2, llm_tokens: 11 }), "LIMIT_REACHED");
  assert.deepEqual(await usage(), { used: 0, reserved: 0 });
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.billing_operations")).rows[0].count, 0);
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.billing_operation_items")).rows[0].count, 0);
});

test("replayed keys never reserve again and conflicting input cannot reuse them", async () => {
  const original = await reserve();
  assert.deepEqual(await reserve(), { ...original, created: false });
  for (const input of [{ resource: otherOwner }, { fingerprint: "b".repeat(64) }]) {
    await rejectsCode(() => reserve({ images: 1 }, input), "OPERATION_CONFLICT");
  }
  await rejectsCode(() => reserve({ images: 2 }), "OPERATION_CONFLICT");
  assert.deepEqual(await usage(), { used: 0, reserved: 1 });
});

test("last-unit reservations accept only one operation in serialized SQL execution", async () => {
  await db.query("UPDATE public.billing_usage_periods SET limit_quantity = 1 WHERE metric = 'images'");
  const results = await Promise.allSettled([reserve(), reserve({ images: 1 }, { key: "operation-0002" })]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.deepEqual(await usage(), { used: 0, reserved: 1 });
});

test("invalid quantities and unknown metrics fail without usage changes", async () => {
  for (const items of [{}, [], null, { images: 0 }, { images: -1 }, { images: 1.5 },
    { images: "1" }, { credits: 1 }, { images: Number.MAX_SAFE_INTEGER + 1 }]) {
    await rejectsCode(() => reserve(items), "INVALID_RESERVATION");
  }
  assert.deepEqual(await usage(), { used: 0, reserved: 0 });
});

test("owner mismatch and disabled accounts cannot create new operations", async () => {
  await rejectsCode(() => reserve({ images: 1 }, { actor: otherOwner }), "OWNERSHIP_REQUIRED");
  await db.query("UPDATE public.billing_accounts SET enabled = false WHERE id = $1", [account]);
  await rejectsCode(() => reserve(), "SUBSCRIPTION_REQUIRED");
});

test("expired, trialing and collection-paused subscriptions fail closed", async () => {
  await db.query("UPDATE public.billing_subscriptions SET status = 'trialing'");
  await rejectsCode(() => reserve(), "SUBSCRIPTION_REQUIRED");
  await db.query("UPDATE public.billing_subscriptions SET status = 'active', pause_collection = true");
  await rejectsCode(() => reserve(), "SUBSCRIPTION_REQUIRED");
  await db.query("UPDATE public.billing_subscriptions SET pause_collection = false, access_expires_at = now() - interval '1 hour'");
  await rejectsCode(() => reserve(), "SUBSCRIPTION_REQUIRED");
});

test("missing, overlapping and catalog-mismatched periods never guess an allowance", async () => {
  await rejectsCode(() => reserve({ projects: 1 }), "BILLING_SYNC_PENDING");
  await rejectsCode(() => reserve({ images: 1 }, { version: "wrong" }), "PLAN_NOT_CONFIGURED");
  await db.query(`INSERT INTO public.billing_usage_periods(account_id, subscription_id, window_start,
    window_end, metric, catalog_version, limit_quantity)
    VALUES ($1, $2, now() - interval '2 days', now() + interval '1 day', 'images', 'fixture-v1', 10)`, [account, subscription]);
  await rejectsCode(() => reserve(), "BILLING_SYNC_PENDING");
});

test("unknown submissions retain quota and the pending-operation cap blocks new work", async () => {
  const operation = await reserve({ images: 1 }, { maxPending: 1 });
  await settle(operation.id, "submission_uncertain", { error: "PROVIDER_TIMEOUT" });
  assert.deepEqual(await usage(), { used: 0, reserved: 1 });
  await rejectsCode(() => reserve({ images: 1 }, { key: "operation-0002", maxPending: 1 }), "CONCURRENCY_LIMIT");
  assert.equal((await reserve()).state, "unknown");
});

test("confirmed work commits exactly once and terminal operations cannot reopen", async () => {
  const operation = await reserve({ images: 2, llm_tokens: 3 });
  await settle(operation.id, "provider_completed");
  assert.equal((await settle(operation.id, "provider_completed")).changed, false);
  await rejectsCode(() => settle(operation.id, "no_work_confirmed"), "INVALID_TRANSITION");
  await rejectsCode(() => settle(operation.id, "submission_uncertain"), "INVALID_TRANSITION");
  assert.deepEqual(await usage(), { used: 2, reserved: 0 });
  assert.deepEqual(await usage("llm_tokens"), { used: 3, reserved: 0 });
});

test("confirmed no-work releases exactly once without giving extra units", async () => {
  const operation = await reserve({ images: 3 });
  await settle(operation.id, "no_work_confirmed");
  assert.equal((await settle(operation.id, "no_work_confirmed")).changed, false);
  await rejectsCode(() => settle(operation.id, "provider_completed"), "INVALID_TRANSITION");
  assert.deepEqual(await usage(), { used: 0, reserved: 0 });
});

test("provider request binding prevents another job from settling an operation", async () => {
  const operation = await reserve();
  await rejectsCode(() => settle(operation.id, "provider_accepted"), "INVALID_TRANSITION");
  await settle(operation.id, "provider_accepted", { provider: "fixture", request: "job-1" });
  await rejectsCode(() => settle(operation.id, "provider_completed", { provider: "fixture", request: "job-2" }), "OPERATION_CONFLICT");
  await rejectsCode(() => settle(operation.id, "provider_completed", { account: otherAccount }), "OPERATION_NOT_FOUND");
  assert.deepEqual(await usage(), { used: 0, reserved: 1 });
});

test("in-flight work settles its original expired period after cancellation and disabling", async () => {
  const operation = await reserve();
  await db.query("UPDATE public.billing_usage_periods SET window_end = now() - interval '1 hour'");
  await db.query("UPDATE public.billing_subscriptions SET status = 'canceled'");
  await db.query("UPDATE public.billing_accounts SET enabled = false");
  await settle(operation.id, "provider_completed");
  assert.deepEqual(await usage(), { used: 1, reserved: 0 });
});

test("a settlement invariant failure rolls back the whole multi-metric transition", async () => {
  const operation = await reserve({ images: 2, llm_tokens: 3 });
  await db.query("UPDATE public.billing_usage_periods SET reserved_quantity = 0 WHERE metric = 'llm_tokens'");
  await rejectsCode(() => settle(operation.id, "provider_completed"), "USAGE_INVARIANT_BROKEN");
  assert.deepEqual(await usage(), { used: 0, reserved: 2 });
  assert.equal((await reserve({ images: 2, llm_tokens: 3 })).state, "reserved");
});

test("authenticated readers see only their account and cannot edit counters or call RPCs", async () => {
  await db.exec("SET ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [otherOwner]);
  assert.equal((await db.query("SELECT id FROM public.billing_accounts")).rows.length, 1);
  assert.equal((await db.query("SELECT * FROM public.billing_usage_periods")).rows.length, 0);
  await assert.rejects(() => reserve(), (error) => error.code === "42501");
  await assert.rejects(() => db.query("UPDATE public.billing_usage_periods SET used_quantity = 0"), (error) => error.code === "42501");
  await assert.rejects(() => db.query("SELECT * FROM public.billing_operations"), (error) => error.code === "42501");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [owner]);
  assert.equal((await db.query("SELECT * FROM public.billing_usage_periods")).rows.length, 2);
});

test("anonymous users cannot read billing or execute a privileged operation", async () => {
  await db.exec("SET ROLE anon");
  await assert.rejects(() => db.query("SELECT * FROM public.billing_accounts"), (error) => error.code === "42501");
  await assert.rejects(() => reserve(), (error) => error.code === "42501");
});

test("operation identity and original reservation items are immutable to ordinary service updates", async () => {
  const operation = await reserve();
  await assert.rejects(() => db.query("UPDATE public.billing_operations SET input_fingerprint = $1 WHERE id = $2", ["b".repeat(64), operation.id]),
    (error) => error.code === "42501");
  await assert.rejects(() => db.query("UPDATE public.billing_operation_items SET quantity = 2"), (error) => error.code === "42501");
});

const limits = { projects: 10, images: 10, video_seconds: 10, narration_characters: 10,
  transcription_seconds: 10, llm_tokens: 10, render_seconds: 10, storage_bytes: 10 };

async function prepareWindow() {
  await db.query(`UPDATE public.billing_subscriptions SET current_period_start = period.window_start,
    current_period_end = period.window_end, access_starts_at = period.window_start, access_expires_at = period.window_end
    FROM public.billing_usage_periods AS period WHERE period.metric = 'images'
    AND public.billing_subscriptions.id = $1 AND period.account_id = $2`, [subscription, account]);
}

async function syncWindow(values = limits, shiftSeconds = 0) {
  return db.query(`SELECT public.sync_billing_usage_window($1, $2,
    (SELECT current_period_start FROM public.billing_subscriptions WHERE id = $2) + $4 * interval '1 second',
    (SELECT current_period_end FROM public.billing_subscriptions WHERE id = $2), 'fixture-v1', $3)`,
  [account, subscription, JSON.stringify(values), shiftSeconds]);
}

test("window provisioning is idempotent and upgrades/downgrades preserve used and reserved units", async () => {
  await prepareWindow();
  const completed = await reserve({ images: 2 });
  await settle(completed.id, "provider_completed");
  const pending = await reserve({ images: 3 }, { key: "operation-0002" });
  await syncWindow();
  await syncWindow({ ...limits, images: 20 });
  await syncWindow({ ...limits, images: 1 });
  assert.deepEqual(await usage(), { used: 2, reserved: 3 });
  await rejectsCode(() => reserve({ images: 1 }, { key: "operation-0003" }), "LIMIT_REACHED");
  await settle(pending.id, "provider_completed");
  assert.deepEqual(await usage(), { used: 5, reserved: 0 });
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.billing_usage_periods")).rows[0].count, 8);
});

test("overlapping replacement anchors cannot refill the existing monthly allowance", async () => {
  await prepareWindow();
  await rejectsCode(() => syncWindow(limits, 1), "BILLING_SYNC_PENDING");
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.billing_usage_periods")).rows[0].count, 2);
});

test("window provisioning rejects malformed catalogs and revoked subscriptions", async () => {
  await prepareWindow();
  for (const values of [null, [], {}, { ...limits, images: -1 }, { ...limits, images: "1" }, { ...limits, extra: 1 }]) {
    await rejectsCode(() => syncWindow(values), "PLAN_NOT_CONFIGURED");
  }
  await db.query("UPDATE public.billing_subscriptions SET status = 'past_due'");
  await rejectsCode(() => syncWindow(), "BILLING_SYNC_PENDING");
});

test("browser roles cannot provision their own limits or paid windows", async () => {
  await prepareWindow();
  await db.exec("SET ROLE authenticated");
  await assert.rejects(() => syncWindow(), (error) => error.code === "42501");
});

async function beginCheckout(overrides = {}) {
  const input = { actor: owner, key: "checkout-fixture-1", fingerprint,
    price: "price_fixture", amount: 4900, ...overrides };
  return (await db.query(`SELECT public.begin_billing_checkout($1,$2,$3,$4,'creator','fixture-v1','month',$5,$6,'usd') AS result`,
    [account, input.actor, input.key, input.fingerprint, input.price, input.amount])).rows[0].result;
}

test("checkout attempts block current subscriptions and simultaneous different keys", async () => {
  await rejectsCode(() => beginCheckout(), "OPERATION_CONFLICT");
  await db.query("UPDATE public.billing_subscriptions SET status = 'canceled'");
  const original = await beginCheckout();
  assert.equal(original.created, true);
  assert.deepEqual(await beginCheckout(), { ...original, created: false });
  await rejectsCode(() => beginCheckout({ key: "checkout-fixture-2" }), "OPERATION_CONFLICT");
  await db.query("UPDATE public.billing_checkout_attempts SET state = 'unknown'");
  await rejectsCode(() => beginCheckout({ key: "checkout-fixture-2" }), "OPERATION_CONFLICT");
});

test("checkout replay binds the original commercial terms even if a hash is reused", async () => {
  await db.query("UPDATE public.billing_subscriptions SET status = 'canceled'");
  await beginCheckout();
  for (const input of [{ price: "price_other" }, { amount: 9900 }, { fingerprint: "b".repeat(64) }]) {
    await rejectsCode(() => beginCheckout(input), "OPERATION_CONFLICT");
  }
  await rejectsCode(() => beginCheckout({ actor: otherOwner }), "OWNERSHIP_REQUIRED");
});

test("customer binding is idempotent but never silently replaces a mapped customer", async () => {
  const bind = (actor, customer) => db.query("SELECT public.bind_billing_customer($1,$2,$3)", [account, actor, customer]);
  await bind(owner, "cus_fixture");
  await bind(owner, "cus_fixture");
  await rejectsCode(() => bind(owner, "cus_other"), "OPERATION_CONFLICT");
  await rejectsCode(() => bind(otherOwner, "cus_fixture"), "OWNERSHIP_REQUIRED");
});

test("authenticated users cannot inspect checkout internals, begin sessions or bind customer IDs", async () => {
  await db.exec("SET ROLE authenticated");
  await assert.rejects(() => db.query("SELECT * FROM public.billing_checkout_attempts"), (error) => error.code === "42501");
  await assert.rejects(() => beginCheckout(), (error) => error.code === "42501");
  await assert.rejects(() => db.query("SELECT public.bind_billing_customer($1,$2,'cus_forged')", [account, owner]), (error) => error.code === "42501");
});

async function receipt(eventId = "evt_fixture") {
  await db.query("SELECT public.record_billing_webhook('test',$1,'customer.subscription.updated','sub_fixture')", [eventId]);
}

async function claim(eventId = "evt_fixture") {
  return (await db.query("SELECT public.claim_billing_webhook($1,'test',$2) AS result", [account, eventId])).rows[0].result;
}

async function projection(overrides = {}) {
  const dates = (await db.query(`SELECT window_start, window_end FROM public.billing_usage_periods WHERE metric = 'images'`)).rows[0];
  return { stripeSubscriptionId: "sub_fixture", customerId: "cus_fixture", priceId: "price_fixture",
    planId: "creator", catalogVersion: "fixture-v1", status: "active", billingInterval: "month",
    cancelAtPeriodEnd: false, pauseCollection: false, periodStart: new Date(dates.window_start).toISOString(),
    periodEnd: new Date(dates.window_end).toISOString(), accessStartsAt: new Date(dates.window_start).toISOString(),
    accessExpiresAt: new Date(dates.window_end).toISOString(), trialEndsAt: null, checkoutAttemptId: null,
    verifiedAt: new Date().toISOString(), ...overrides };
}

async function applyProjection(token, value, eventId = "evt_fixture", values = null) {
  return (await db.query("SELECT public.apply_billing_subscription($1,'test',$2,$3,$4,$5,$6,$7) AS result",
    [account, eventId, token, JSON.stringify(value), values === null ? null : JSON.stringify(values),
      values === null ? null : value.periodStart, values === null ? null : value.periodEnd])).rows[0].result;
}

async function bindFixtureCustomer() {
  await db.query("SELECT public.bind_billing_customer($1,$2,'cus_fixture')", [account, owner]);
}

test("durable webhook receipts deduplicate and serialize different events for one account", async () => {
  await receipt();
  await receipt();
  await receipt("evt_second");
  const first = await claim();
  assert.equal(first.claimed, true);
  assert.equal((await claim("evt_second")).status, "busy");
  await rejectsCode(() => db.query("SELECT public.record_billing_webhook('test','evt_fixture','invoice.paid','in_other')"), "OPERATION_CONFLICT");
});

test("projection, allowance sync and processed receipt commit atomically without refilling usage", async () => {
  await bindFixtureCustomer();
  const operation = await reserve({ images: 3 });
  await settle(operation.id, "provider_completed");
  await receipt();
  const first = await claim();
  assert.equal((await applyProjection(first.token, await projection(), "evt_fixture", limits)).isCurrent, true);
  assert.deepEqual(await usage(), { used: 3, reserved: 0 });
  assert.deepEqual(await claim(), { claimed: false, status: "processed", token: null });
  assert.equal((await db.query("SELECT attempts FROM public.billing_webhook_events")).rows[0].attempts, 1);
});

test("reclaimed account leases fence stale workers before any subscription update", async () => {
  await bindFixtureCustomer();
  await receipt();
  await receipt("evt_second");
  const stale = await claim();
  await db.query("UPDATE public.billing_sync_leases SET expires_at = now() - interval '1 second'");
  const fresh = await claim("evt_second");
  assert.equal(fresh.claimed, true);
  await rejectsCode(async () => applyProjection(stale.token, await projection({ status: "canceled" })), "BILLING_SYNC_PENDING");
  assert.equal((await db.query("SELECT status FROM public.billing_subscriptions WHERE id = $1", [subscription])).rows[0].status, "active");
  await applyProjection(fresh.token, await projection(), "evt_second");
});

test("failed allowance application rolls back subscription changes and remains retryable", async () => {
  await bindFixtureCustomer();
  await receipt();
  const lease = await claim();
  await rejectsCode(async () => applyProjection(lease.token, await projection({ status: "canceled" }), "evt_fixture", limits), "BILLING_SYNC_PENDING");
  assert.equal((await db.query("SELECT status FROM public.billing_subscriptions WHERE id = $1", [subscription])).rows[0].status, "active");
  assert.equal((await db.query("SELECT status FROM public.billing_webhook_events")).rows[0].status, "processing");
  await db.query("SELECT public.fail_billing_webhook($1,'test','evt_fixture',$2,'BILLING_SYNC_PENDING')", [account, lease.token]);
  assert.equal((await db.query("SELECT status FROM public.billing_webhook_events")).rows[0].status, "failed");
  assert.equal((await claim()).claimed, true);
});

test("events for a historical subscription cannot downgrade its current replacement", async () => {
  await bindFixtureCustomer();
  await db.query("UPDATE public.billing_subscriptions SET is_current = false WHERE id = $1", [subscription]);
  await db.query(`INSERT INTO public.billing_subscriptions(account_id,stripe_mode,stripe_subscription_id,
    stripe_price_id,plan_id,catalog_version,status,billing_interval,is_current)
    VALUES ($1,'test','sub_replacement','price_fixture','creator','fixture-v1','active','month',true)`, [account]);
  await receipt();
  const lease = await claim();
  assert.equal((await applyProjection(lease.token, await projection({ status: "canceled", accessStartsAt: null, accessExpiresAt: null }))).isCurrent, false);
  const current = (await db.query("SELECT stripe_subscription_id,status FROM public.billing_subscriptions WHERE is_current")).rows[0];
  assert.deepEqual(current, { stripe_subscription_id: "sub_replacement", status: "active" });
});

test("browser users cannot claim sync authority or inspect recovery leases", async () => {
  await receipt();
  await db.exec("SET ROLE authenticated");
  await assert.rejects(() => claim(), (error) => error.code === "42501");
  await assert.rejects(() => db.query("SELECT * FROM public.billing_sync_leases"), (error) => error.code === "42501");
});

test("an app-linked checkout can establish the replacement subscription and complete atomically", async () => {
  await bindFixtureCustomer();
  await db.query("UPDATE public.billing_subscriptions SET status = 'canceled'");
  const attempt = await beginCheckout();
  await receipt();
  const lease = await claim();
  const result = await applyProjection(lease.token, await projection({ stripeSubscriptionId: "sub_new", checkoutAttemptId: attempt.id }));
  assert.equal(result.isCurrent, true);
  assert.deepEqual((await db.query("SELECT stripe_subscription_id FROM public.billing_subscriptions WHERE is_current")).rows,
    [{ stripe_subscription_id: "sub_new" }]);
  assert.equal((await db.query("SELECT state FROM public.billing_checkout_attempts")).rows[0].state, "complete");
});

test("unlinked replacement subscriptions cannot obtain current authority from metadata alone", async () => {
  await bindFixtureCustomer();
  await db.query("UPDATE public.billing_subscriptions SET status = 'canceled'");
  await receipt();
  const lease = await claim();
  await rejectsCode(async () => applyProjection(lease.token, await projection({ stripeSubscriptionId: "sub_unlinked",
    checkoutAttemptId: "90000000-0000-0000-0000-000000000001" })), "BILLING_SYNC_PENDING");
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.billing_subscriptions")).rows[0].count, 1);
});

test("unsupported receipts can be ignored without downgrading a claimed account sync", async () => {
  await receipt();
  await claim();
  await db.query("SELECT public.ignore_billing_webhook('test','evt_fixture')");
  assert.equal((await db.query("SELECT status FROM public.billing_webhook_events")).rows[0].status, "processing");
  await receipt("evt_other");
  await db.query("SELECT public.ignore_billing_webhook('test','evt_other')");
  assert.equal((await db.query("SELECT status FROM public.billing_webhook_events WHERE stripe_event_id = 'evt_other'")).rows[0].status, "ignored");
});
