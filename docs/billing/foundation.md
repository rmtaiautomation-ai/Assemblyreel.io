# Billing foundation — offline implementation slice

Implemented locally on 2026-10-06. Configuration and activation are deferred by user choice.

This document preserves evidence from the **initial 51-test slice**. The current
implementation has advanced beyond it: see [billing core implementation](core-implementation.md)
for atomic SQL execution, trusted adapters, guarded Stripe routes and remaining work.

## Delivered

| File | Responsibility |
|---|---|
| `db/add-billing-accounts.sql` | Draft accounts, subscriptions, webhook-event tables and owner-read/server-write permissions |
| `db/add-billing-usage.sql` | Draft allowance periods, operation records, and original per-metric reservation items |
| `src/features/billing/types.ts` | Shared status, metric, operation, offer, access and usage contracts |
| `src/features/billing/plans.ts` | Explicitly provisional price proposals; empty approved catalog, disabled default and sample-only preview |
| `src/server/billing/entitlements.ts` | Pure server policy over a trusted subscription projection |
| `src/server/billing/usage-policy.ts` | Safe integer quota arithmetic and confirmed/uncertain operation outcomes |
| `tests/billing/*` | Readiness tests plus access, quota, transition and static SQL-contract tests |

At the end of this initial slice, no existing route/action imported these new policy modules.
Later slices replaced the Stripe scaffold routes behind disabled gates; generation/app access,
environment files, remote databases and deployment remain unchanged.

## Design decisions

- One personal billing account per auth user. `auth.users` is the authoritative identity dependency; no second `profiles` table or identity backfill is fabricated.
- New accounts default to disabled. Enabling an account alone is insufficient: the policy also requires explicit global activation, an approved versioned catalog, a current verified active subscription, ownership and a valid access window.
- Trial subscriptions do not grant paid operations in the approved sample-only MVP. Statuses remain representable for reconciliation/history.
- Scheduled cancellation does not immediately revoke the verified paid-through window. Past-due, paused, unpaid, incomplete, canceled, unknown and collection-paused states do not grant costly operations under this conservative draft policy.
- UTC/explicit-offset timestamps are required. Access start is inclusive, expiry exclusive; absent, invalid, future-verification or reversed dates fail closed.
- Resource quantities are nonnegative safe integers; operation quantities are positive. Units: projects, image outputs, generated video seconds, narration characters, transcription seconds, LLM tokens, render seconds, storage bytes. Final allowances are unapproved.
- Workspace capacity is a separate plan limit, not a monthly consumable counter. Its atomic count/create enforcement is not implemented yet.
- Downgrades may leave usage above the new limit. Do not erase it or enforce a SQL constraint that prevents recording that legitimate state.
- Unknown vendor outcomes stay unresolved. Confirmed work commits; confirmed no-work releases. Terminal states cannot reopen, and duplicate terminal evidence produces no further state change.
- Operation keys and original reservation items are durable and immutable to ordinary service-role updates. Composite foreign keys prevent linking reservation items across accounts/metrics.
- Auth deletion nulls the account-owner link rather than cascading accounting history. This is a technical preservation default, not a final retention policy; review anonymization/retention before application. Remaining billing foreign keys prevent ordinary parent deletion from erasing ledger history.

## Permission boundary in the draft SQL

All six tables enable/force RLS and revoke inherited browser privileges. Authenticated users receive owner-only SELECT on accounts, subscriptions and usage periods. Events, operations, fingerprints and reservation items remain server-private. There are no browser write policies or callable privileged RPCs in this slice.

Service-role permissions are explicit. Operation input identity/fingerprint and item quantities are not service-role update targets; settlement/status fields can be updated by the future trusted server boundary. Verify Supabase's role properties and actual grants during staging testing.

This describes intended SQL protections, **not a proof that the deployed database is protected**. The files are unapplied and deliberately fail on existing table names rather than accepting an unknown schema layout.

## Verification

- `npm run test:billing`: 51 passing tests (13 readiness, 23 access, 10 quota/state and 5 static SQL-contract checks).
- `npm run lint:billing`: passed; `--no-ignore` ensures the newly added `src` files are actually checked despite the repository's existing global ignore.
- `npm run typecheck`: passed.
- `npm run build`: passed after foundation additions; no route behavior changed.
- No SQL script was executed. No PostgreSQL/Supabase execution environment was configured in this session.

Pure TypeScript modules are compiled in memory with the installed TypeScript package for local tests. The shared contract module is resolved from the actual source, not mocked. These tests do not initialize Next, Supabase or Stripe and are not substitutes for auth/provider/database integration tests.

## Not implemented or verified yet

- Session verification, DB repositories and authorization adapters. A browser-supplied actor/subscription/approved plan must never be passed into the policy as trusted proof.
- Atomic reserve/commit/release RPCs, counters, transaction locks, concurrency tests, allowance-window creation and reconciliation. Quota arithmetic is **not** an authoritative reservation API.
- Executable SQL syntax/migration compatibility, RLS/grant behavior, cross-account REST/RPC tests, fresh/existing-schema application or rollback tests. Static checks only catch drift and obvious policy omissions.
- Stripe checkout, portal, durable webhook processing/coordination, API-version alignment and customer backfill.
- Generation/worker/render integration, hosted storage, real billing/onboarding UI or final offers.
- Production security or launch readiness. Existing scaffold routes remain unchanged and retain the weaknesses listed in plan 25.

## Next implementation slice

Build trusted server/DB adapters and draft atomic reservation/settlement functions against these contracts, with mocked call tests. Keep all integration disconnected/disabled until wiring is explicitly verified. Configure an isolated database and Stripe test environment later to execute the SQL and real lifecycle/concurrency tests before activation.

Deployment/application is not authorized by completing this slice. Do not apply all historical SQL blindly; retain existing user projects and credits until the approved migration/backfill procedure is ready.

References: [plan 25](../../implementation_plans/25-monetization-subscription-system.md), [configuration handoff](phase-0-readiness.md), [PostgreSQL policies](https://www.postgresql.org/docs/current/sql-createpolicy.html), [Supabase grants/RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
