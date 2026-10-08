# Billing core — implementation checkpoint

Date: 2026-10-06. No sales, deployment, remote API calls or Supabase migration performed.

## Current scope

The coding-standards skill guided narrow feature/server ownership, explicit contracts,
safe errors and injected dependencies for tests. This is **not the completed subscription
module**. Business approvals/configuration are deferred; implementation continues locally.

| Slice | Implemented | Still required |
|---|---|---|
| Schema | Eight billing tables with RLS/grants, durable original items and account-mode links | Staging roles, existing-schema compatibility, rollout/backfill/retention review |
| Authorization | Verified-user adapter, workspace/project/scene/media ownership traversal, current paid-access policy | Real auth screens/session refresh, integration across existing actions, worker identity persistence |
| Catalog | Proposals separate from empty approved plans/offers; exact price/currency/interval/mode checks | Cost validation, final allowances/prices, annual offer approval |
| Usage | Atomic multi-metric reservation and settlement, input-bound replay, pending-work cap | Real multi-connection concurrency, atomic channel/project creation, provider-specific quantities and recovery |
| Windows | Original UTC month anchor, leap/month-end tests, idempotent SQL provisioning, usage retained on tier changes | Scheduled annual refresh, approved proration/cycle-change carry-over policy |
| Checkout/portal | Server plan choice, strict origin/body validation, private attempts, stable Stripe idempotency keys, customer binding, separate portal gate | Account enrollment/backfill, checkout-return UI, expired/unknown-attempt reconciliation, actual sandbox lifecycle |
| Webhooks | Raw signature/version/mode verification, durable receipts, account lease/fencing, latest paid-invoice/item checks, atomic projection/window/receipt transaction | Scheduled retry/missed-event recovery, alerting, checkout-expiry handling, real reversed/concurrent deliveries |
| Generation | Shared reserve -> durable uncertainty -> provider -> settlement coordinator | Wire and audit every provider/worker/render path; output persistence and usage/cost evidence |
| Customer UI | Existing UI retained | Replace fake auth, pricing, billing/invoices and onboarding; integrate private hosted export |

## Changed behavior

`/api/stripe/{checkout,portal,webhook}` now call the new server services, not legacy `profiles`.
They return JSON with safe error codes and private/no-store cache headers. All are disabled
by default. The old unreferenced `src/lib/stripe-server.ts` dummy-key singleton was removed;
its previous implementation remains recoverable in Git. No accounting/customer data was deleted.

The auth proxy, existing generation routes/actions, pricing/onboarding and mock billing screen
are **not** wired to the new usage engine. Do not interpret disabled sales as a complete guard
against existing generation spend. Existing development workflows remain unchanged.

Flags are independent and server-only; **do not enable them yet**:

- `BILLING_ENABLED`: generation-policy runtime; also requires a nonempty approved plan catalog.
- `BILLING_SALES_ENABLED`: checkout; also requires approved plans and offers. A flag/price env
  value alone cannot approve the provisional prices or invent quotas.
- `BILLING_PORTAL_ENABLED`: mapped-owner billing management, independent of subscription status,
  account generation enablement and new sales.
- `BILLING_WEBHOOKS_ENABLED`: signed event processing, independent of new sales so cancellation
  and recovery can continue through a sales shutdown.
- `BILLING_STRIPE_MODE`: explicitly `test` or `live`; no silent live-mode fallback.

Existing credential names remain `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SITE_URL`. No env file was edited. Origins must be explicit; no localhost fallback.
Admin clients are lazy/server-only and have no request cookies or persisted user sessions.

The new Stripe client is pinned to the installed SDK's typed API contract,
`2026-06-24.dahlia`. Configure the test webhook endpoint to that version later; a mode/version
mismatch fails closed. No live key or real signing secret was used in tests.

## Transaction/retry rules

1. Reserve and settle lock the account first. Every requested metric succeeds together or the
   SQL statement rolls back. Used/reserved counters are not browser-writable.
2. The same account/key must retain resource, canonical input fingerprint and original metric
   quantities. A replay is status/recovery only: it never authorizes a second provider start.
3. Persist uncertainty before calling a vendor. Timeouts, generic exceptions, process crashes,
   failed output storage and polling failures are **not** proof of no work and do not refund.
4. Service-side confirmed completion commits the original reserved quantity once. Confirmed
   no-work releases once. Provider IDs cannot be rebound. In-flight work settles its original
   window even after renewal, downgrade, cancellation or disabling.
5. This does not guarantee exactly-once vendor execution. Adapters must define evidence,
   idempotency support, output delivery and recovery. Reserving worst-case LLM/output bounds
   and any post-completion adjustment policy still require integration/cost decisions.
6. Window upsert changes approved limits/version but never resets used/reserved counters.
   Overlapping replacement anchors fail rather than create a fresh bucket. New anchors after
   proration/cycle changes need an explicit carry-over policy, not a blind reset.
7. One unresolved checkout per account remains blocking across new keys. Unknown/expired-age
   attempts need verified Stripe recovery; age alone cannot permit another subscription.
8. Webhook account leases serialize syncs. Fresh subscription/latest invoice retrieval occurs
   after claim. Reclaimed/expired tokens cannot publish stale state. Subscription, allowance
   sync and processed receipt commit in one RPC. Old subscription events retain history but
   cannot override the current replacement. New authority requires an app-linked DB attempt.
9. Active status alone grants nothing. The latest paid invoice must belong to the mapped
   customer/subscription, and a non-proration line must cover the recurring item/price/cycle.
   Trialing and unsupported/multiple-item offers grant no costly preview under this MVP.

The 90-second account-sync lease and 4-operation runtime cap are conservative technical
defaults, not promised plan allowances. Validate them with staged provider latency/recovery.

## Local verification

`npm run test:billing` currently covers 159 tests, including 34 executable PostgreSQL tests,
real **local-only** Stripe signature verification, HTTP input/origin/cache/error behavior,
mocked auth/repository/checkout/webhook/provider calls, calendar and access rules.

- Targeted billing lint and TypeScript checks pass.
- Production build passes after replacing the Stripe routes.
- Local production-server POST smoke test: all three Stripe routes returned 503 JSON
  `BILLING_DISABLED` with private/no-store headers. Test-process flags were forced off;
  disk configuration was not changed and no external calls occurred.
- `git diff --check` passes apart from informational LF/CRLF notices.
- Global lint retains unrelated baseline issues in `scripts/deploy-lambda.js` and smoke scripts.

Pinned dev-only `@electric-sql/pglite@0.5.8` executes the actual six SQL files in ephemeral RAM.
Fixtures emulate Supabase roles, `auth.users` and `auth.uid`; they contain synthetic IDs only.
This verifies SQL execution, RLS/grants, transaction rollback and recovery fences, **not**
Supabase/PostgREST compatibility or multi-connection locking. PGlite uses a single connection;
the last-unit Promise test proves only serialized acceptance, not simultaneous PG sessions.

The install reported 21 dependency vulnerabilities (6 moderate, 14 high, 1 critical). No
automatic/breaking audit fixes were applied; attribution and remediation are a separate review.

## Deferred setup versus unfinished implementation

User/account-owner setup stays in [Phase 0 readiness](phase-0-readiness.md). No new keys,
pricing decisions or staging resources are needed to continue the unfinished code work.
They are required later for applied schema/Stripe/provider integration and launch sign-off.

Next code slices: auth/session and account provisioning; checkout return/expiry recovery;
scheduled reconciliation; atomic workspace/project creation; all Phase 7 generation paths;
durable/private hosted render delivery; truthful pricing/onboarding/live billing UI.
Do not mark any full phase complete or enable purchases because local tests/build pass.

References: [plan 25](../../implementation_plans/25-monetization-subscription-system.md),
[PostgreSQL function permissions](https://www.postgresql.org/docs/current/sql-createfunction.html),
[Stripe webhook behavior](https://docs.stripe.com/webhooks),
[Stripe subscription lifecycle](https://docs.stripe.com/billing/subscriptions/webhooks),
[Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).
