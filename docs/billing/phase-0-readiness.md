# Billing Phase 0 — Local evidence and staging handoff

Date: 2026-10-06. Starting commit: `5c9753c`; branch: `feat/audio-first-long-form`.

## Confirmed decisions

- Pre-generated sample preview only; generation requires paid checkout. No free provider-backed trial in MVP.
- Creator $49, Pro $99 and Studio $249 monthly prices remain provisional. Do not enable sales.
- No separate staging Supabase project or Stripe test setup has been confirmed.
- The offline implementation uses one personal billing account per user; team billing is deferred. Resource allowances, final prices, annual billing and existing-user treatment still require confirmation.
- User authorized implementation before configuration. Staging is an activation/integration prerequisite, not a blocker for isolated drafts, contracts and mocked/local tests.

## Work completed

- Recorded baseline typecheck, production build, and lint results.
- Added an offline configuration checker with redacted output. It validates formats, placeholder values, public-versus-admin Supabase key placement, test/live Stripe mode consistency, and origins.
- Initially added a Node built-in test suite and targeted lint command without dependencies;
  later installed pinned dev-only `@electric-sql/pglite@0.5.8` to execute PostgreSQL tests in memory.
- Prepared `db/audit-billing-readiness.sql`: read-only table/column, RLS, grants, signup-trigger and index metadata inspection. It selects no customer rows and is not a migration.
- Preserved generation/dashboard access and existing plan changes. Later slices replaced the
  Stripe scaffold routes with disabled-by-default handlers. No env files, remote queries,
  purchases, provider calls, deployments or Supabase migrations were performed. Draft SQL
  was executed only against ephemeral local test fixtures.

The checker is an implementation prerequisite, **not runtime authorization**. Stripe routes
now use the guarded [billing core](core-implementation.md), but generation gates/auth UI and
live integration remain unfinished. A green format check does not prove key validity,
endpoint configuration, staging isolation, schema safety, or profitability.

## Verification results

| Command | Result |
|---|---|
| `npm run typecheck` | Passed before implementation; rechecked after tooling changes |
| `npm run build` | Baseline passed; no runtime source files changed in this slice |
| `npm run lint` | Existing failure: two `no-require-imports` errors in `scripts/deploy-lambda.js`; two unrelated unused-variable warnings |
| `npm run test:billing` | Readiness slice: 13 tests; initial foundation: 51. Current results are recorded in `core-implementation.md` |
| `npm run lint:billing` | Explicitly bypasses the existing `src/**` ignore for targeted billing modules, scripts and tests; does not conceal the existing global lint failure |
| `npm run check:billing` | Expected exit 1: current Stripe settings do not pass test-mode/signing-secret format checks; explicit `NEXT_PUBLIC_SITE_URL` is missing |
| SQL audit | Prepared, not executed. Database schema, triggers, policies and grants remain unverified remotely |

Supabase URL/public/admin key **formats** passed the offline check. No API call verified their privileges, project identity, or validity. No secret values or database connection strings belong in this document.

## Local commands

```sh
npm run test:billing
npm run lint:billing
npm run check:billing
npm run check:billing -- --help
```

The checker defaults to inherited process variables, then `.env.local`, then `.env`, in that precedence. Explicit files can be supplied; the first file takes priority over later files, while process variables always win. Explicit missing files fail instead of silently falling back.

```sh
npm run check:billing -- --config-file .env.billing.staging.local
```

The existing `.gitignore` already ignores `.env*`. Do not commit a filled environment file or paste keys into chat. The checker makes no network requests and never applies settings to Next.js.

## Staging prerequisites — user/account-owner setup

These require an account-owner choice and potentially additional service resources; no provisioning has been performed automatically.

1. Select/create an isolated Supabase staging project (or an explicitly chosen local Supabase instance). Do not assume the current URL is staging. Record project identity privately.
2. Supply a sanitized staging schema/data fixture. Use a reviewed backup/clone procedure; do not blindly execute every historical SQL file or copy production customer records.
3. Select Stripe's test/sandbox environment and obtain its test publishable/secret keys. No live payment tests.
4. Store staging Supabase URL/public/admin keys, Stripe test keys, and an explicit local/staging `NEXT_PUBLIC_SITE_URL` in the ignored staging env file. Only server-side code may receive the Supabase admin or Stripe secret key.
5. When forwarding test webhooks or registering a staging endpoint, use that listener/endpoint's signing secret. Do not reuse an unrelated live endpoint secret.
6. Run the offline checker. Passing means formats look consistent; separately confirm project/account identities and key permissions.
7. Review/run `db/audit-billing-readiness.sql` against the chosen staging database. It wraps metadata queries in a read-only transaction and rolls back. Review policy/default/index output for embedded identifiers before sharing it.
8. Reconcile `users` versus `profiles`, auth trigger ownership/defaults, browser grants and RLS. Confirm actual storage policies/public bucket behavior separately; the SQL audit lists policies but does not certify storage isolation.
9. Review the drafted personal billing-account contract and approve migration/backfill treatment. Then apply/test the migrations in staging; isolated implementation can proceed before this configuration work.

## Cost worksheet — not measured yet

Fill this from approved vendor pricing and bounded staging runs after a spending budget is approved. Do not run existing AI smoke scripts as free tests: they call paid services.

| Resource | Unit to decide | Short project | Long project | Retry/regeneration allowance |
|---|---|---|---|---|
| Script/agent LLM work | Bounded tokens and operations | Not measured | Not measured | Not approved |
| Generated images/thumbnails | Outputs by enabled model/size | Not measured | Not measured | Not approved |
| Generated video | Seconds by enabled model | Not measured | Not measured | Not approved |
| Narration / transcription | Characters / audio seconds | Not measured | Not measured | Not approved |
| Rendering | Minutes/frames by settings | Not measured | Not measured | Not approved |
| Storage / egress | Stored bytes / transferred bytes | Not measured | Not measured | Not approved |
| Payment fees / operational headroom | Confirmed currency/region and margin | Not measured | Not measured | Not approved |

## Deferred activation gate and next step

Phase 0's configuration work is **deferred**, not complete. Continue isolated implementation with billing disabled and explicit provisional terms. Before applying schema changes or activating billing, identify staging and verify schema/account mapping, keys and commercial terms. Do not activate paid tier limits, migrations, production access gates or checkout from unapproved assumptions.

The local prerequisite tooling and [foundation slice](foundation.md) are ready for review. Do not describe the full subscription system as implemented or production-secure.

Implementation references: [plan 25](../../implementation_plans/25-monetization-subscription-system.md), [Node test runner](https://nodejs.org/docs/latest-v24.x/api/test.html), [Stripe API keys](https://docs.stripe.com/keys), [Supabase RLS/grants](https://supabase.com/docs/guides/database/postgres/row-level-security).
