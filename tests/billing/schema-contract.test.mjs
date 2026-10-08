import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { importTypeScript } from "./import-typescript.mjs";

const accounts = (await readFile(new URL("../../db/add-billing-accounts.sql", import.meta.url), "utf8")).replace(/--[^\r\n]*/g, "");
const usage = (await readFile(new URL("../../db/add-billing-usage.sql", import.meta.url), "utf8")).replace(/--[^\r\n]*/g, "");
const otherMigrations = await Promise.all(["add-billing-usage-functions.sql", "add-billing-usage-windows.sql",
  "add-billing-checkout.sql", "add-billing-webhook-functions.sql"].map(async (file) =>
  (await readFile(new URL(`../../db/${file}`, import.meta.url), "utf8")).replace(/--[^\r\n]*/g, "")));
const { USAGE_METRICS, SUBSCRIPTION_STATUSES, OPERATION_STATES } = await importTypeScript(new URL("../../src/features/billing/types.ts", import.meta.url));

function checkValues(sql, column) {
  const values = new RegExp(`CHECK \\(\\s*${column} IN \\(([^)]+)\\)`, "i").exec(sql)?.[1];
  assert.ok(values, `Missing check constraint for ${column}`);
  return [...values.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
}

// Static drift/safety checks only, NOT executable PostgreSQL/RLS proofs.
test("SQL enums stay aligned with production billing contracts", () => {
  assert.deepEqual(checkValues(accounts, "status"), [...SUBSCRIPTION_STATUSES].sort());
  assert.deepEqual(checkValues(usage, "metric"), [...USAGE_METRICS].sort());
  assert.deepEqual(checkValues(usage, "state"), [...OPERATION_STATES].sort());
});

test("each draft table explicitly enables and forces RLS", () => {
  for (const sql of [accounts, usage, ...otherMigrations]) {
    for (const [, table] of sql.matchAll(/CREATE TABLE public\.(billing_\w+)/g)) {
      assert.ok(sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`));
      assert.ok(sql.includes(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`));
    }
  }
});

test("every billing RPC uses invoker permissions, fixed search path and service-only execute grants", () => {
  for (const sql of otherMigrations) {
    assert.doesNotMatch(sql, /SECURITY DEFINER/i);
    assert.equal([...sql.matchAll(/CREATE FUNCTION/g)].length, [...sql.matchAll(/SECURITY INVOKER/g)].length);
    assert.equal([...sql.matchAll(/CREATE FUNCTION/g)].length, [...sql.matchAll(/SET search_path = pg_catalog, public/g)].length);
    assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION[\s\S]*?TO service_role;/);
    assert.doesNotMatch(sql, /GRANT (?:EXECUTE|ALL)[^;]*TO (?:PUBLIC|anon|authenticated)/i);
  }
});

test("browser grants and policies are select-only, with private events and operations", () => {
  for (const sql of [accounts, usage]) {
    const grants = [...sql.matchAll(/GRANT\s+([\s\S]*?)\s+TO authenticated;/gi)];
    assert.ok(grants.length > 0);
    for (const [, grant] of grants) assert.match(grant.trim(), /^SELECT ON /i);
    for (const [policy] of sql.matchAll(/CREATE POLICY[\s\S]*?;/gi)) assert.match(policy, /FOR SELECT TO authenticated/i);
    assert.match(sql, /REVOKE ALL[\s\S]*?FROM PUBLIC, anon, authenticated, service_role;/i);
    assert.doesNotMatch(sql, /CREATE (?:OR REPLACE )?FUNCTION/i);
  }
  assert.doesNotMatch(accounts, /GRANT SELECT ON[^;]*billing_webhook_events[^;]*TO authenticated/i);
  assert.doesNotMatch(usage, /GRANT SELECT ON[^;]*billing_operations[^;]*TO authenticated/i);
});

test("billing drafts are additive and do not rewrite legacy identity/project data", () => {
  for (const sql of [accounts, usage]) {
    assert.match(sql, /^\s*BEGIN;/);
    assert.match(sql, /COMMIT;\s*$/);
    assert.doesNotMatch(sql, /\b(?:DROP|TRUNCATE|DELETE FROM|INSERT INTO|CREATE TRIGGER)\b/i);
    assert.doesNotMatch(sql, /ALTER TABLE (?:public\.)?(?:users|profiles|workspaces|video_projects)\b/i);
  }
  assert.match(accounts, /REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
});

test("operation items enforce account/metric consistency and durable idempotency keys", () => {
  assert.match(usage, /UNIQUE \(account_id, operation_key\)/);
  assert.match(usage, /FOREIGN KEY \(operation_id, account_id\)/);
  assert.match(usage, /FOREIGN KEY \(usage_period_id, account_id, metric\)/);
  assert.match(usage, /PRIMARY KEY \(operation_id, metric\)/);
  assert.doesNotMatch(usage, /used_quantity\s*\+\s*reserved_quantity\s*<=\s*limit_quantity/);
});
