-- Phase 0: read-only schema metadata audit. This is NOT a migration.
-- Prefer a separate staging project. Review output before sharing it; policy
-- expressions/defaults may include existing hardcoded identifiers.
-- No customer rows, credentials, keys, or connection strings are selected.
BEGIN TRANSACTION READ ONLY;

-- Table presence and RLS flags. Missing tables remain visible in this result.
WITH wanted(table_name) AS (
  VALUES ('users'), ('profiles'), ('workspaces'), ('video_projects'), ('scenes'),
    ('media'), ('timeline_items'), ('act_narrations'), ('thumbnails'),
    ('billing_accounts'), ('billing_subscriptions'), ('billing_webhook_events'),
    ('billing_usage_periods'), ('billing_operations'), ('billing_operation_items'),
    ('billing_checkout_attempts'), ('billing_sync_leases')
)
SELECT wanted.table_name,
  tables.oid IS NOT NULL AS exists,
  tables.relrowsecurity AS rls_enabled,
  tables.relforcerowsecurity AS rls_forced
FROM wanted
LEFT JOIN pg_namespace AS schemas ON schemas.nspname = 'public'
LEFT JOIN pg_class AS tables ON tables.relnamespace = schemas.oid
  AND tables.relname = wanted.table_name AND tables.relkind IN ('r', 'p')
ORDER BY wanted.table_name;

-- Identity/ownership, legacy billing, and proposed billing columns/defaults.
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('users', 'profiles', 'workspaces', 'video_projects',
    'billing_accounts', 'billing_subscriptions', 'billing_webhook_events',
    'billing_usage_periods', 'billing_operations', 'billing_operation_items',
    'billing_checkout_attempts', 'billing_sync_leases')
ORDER BY table_name, ordinal_position;

-- Policies need review together with grants, not in isolation.
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('users', 'profiles',
    'workspaces', 'video_projects', 'scenes', 'media', 'timeline_items',
    'act_narrations', 'thumbnails', 'billing_accounts', 'billing_subscriptions',
    'billing_webhook_events', 'billing_usage_periods', 'billing_operations',
    'billing_operation_items', 'billing_checkout_attempts', 'billing_sync_leases'))
  OR (schemaname = 'storage' AND tablename IN ('objects', 'buckets'))
ORDER BY schemaname, tablename, policyname;

SELECT table_schema, table_name, grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_schema IN ('public', 'storage')
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
  AND (table_name IN ('users', 'profiles', 'workspaces', 'video_projects',
    'scenes', 'media', 'timeline_items', 'act_narrations', 'thumbnails',
    'billing_accounts', 'billing_subscriptions', 'billing_webhook_events',
    'billing_usage_periods', 'billing_operations', 'billing_operation_items',
    'billing_checkout_attempts', 'billing_sync_leases')
    OR (table_schema = 'storage' AND table_name IN ('objects', 'buckets')))
ORDER BY table_schema, table_name, grantee, privilege_type;

SELECT table_schema, table_name, column_name, grantee, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name IN ('users', 'profiles', 'billing_accounts',
    'billing_subscriptions', 'billing_usage_periods', 'billing_operations',
    'billing_operation_items', 'billing_checkout_attempts', 'billing_sync_leases')
  AND grantee IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
ORDER BY table_name, column_name, grantee, privilege_type;

-- Inspect signup trigger names and target functions, not function bodies.
SELECT schemas.nspname AS table_schema, tables.relname AS table_name,
  triggers.tgname AS trigger_name, triggers.tgenabled AS enabled,
  function_schemas.nspname AS function_schema, functions.proname AS function_name,
  functions.prosecdef AS security_definer
FROM pg_trigger AS triggers
JOIN pg_class AS tables ON tables.oid = triggers.tgrelid
JOIN pg_namespace AS schemas ON schemas.oid = tables.relnamespace
JOIN pg_proc AS functions ON functions.oid = triggers.tgfoid
JOIN pg_namespace AS function_schemas ON function_schemas.oid = functions.pronamespace
WHERE NOT triggers.tgisinternal
  AND ((schemas.nspname = 'auth' AND tables.relname = 'users')
    OR (schemas.nspname = 'public' AND tables.relname IN ('users', 'profiles', 'workspaces')))
ORDER BY schemas.nspname, tables.relname, triggers.tgname;

-- Key/index definitions do not prove the existing data matches Stripe.
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('users', 'profiles', 'workspaces', 'video_projects',
    'billing_accounts', 'billing_subscriptions', 'billing_webhook_events',
    'billing_usage_periods', 'billing_operations', 'billing_operation_items',
    'billing_checkout_attempts', 'billing_sync_leases')
ORDER BY tablename, indexname;

-- Function permissions and role attributes, without function bodies/secrets.
SELECT routines.routine_name, routines.grantee, routines.privilege_type
FROM information_schema.routine_privileges AS routines
WHERE routines.routine_schema = 'public'
  AND routines.routine_name IN ('reserve_billing_operation', 'settle_billing_operation',
    'sync_billing_usage_window', 'begin_billing_checkout', 'bind_billing_customer',
    'record_billing_webhook', 'ignore_billing_webhook', 'claim_billing_webhook',
    'apply_billing_subscription', 'fail_billing_webhook')
ORDER BY routines.routine_name, routines.grantee;

SELECT rolname, rolsuper, rolinherit, rolbypassrls
FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') ORDER BY rolname;

ROLLBACK;
