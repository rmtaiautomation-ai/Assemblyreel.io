# Monetization & Subscription System — Evaluated Implementation Plan

> **Plan:** 25
>
> **Created:** 2026-10-02
>
> **Repository evaluation:** 2026-10-06
>
> **Status:** Billing backend slices implemented locally: protected draft schema, trusted adapters, atomic usage, checkout/portal, and durable webhook application. Full phase acceptance and customer-facing integration remain pending.
>
> **Implementation boundary:** Stripe routes now use guarded handlers and return `BILLING_DISABLED` by default. Generation/app access is unchanged; approved catalogs are empty. SQL was tested only in ephemeral PostgreSQL fixtures, not applied to Supabase. No env files, remote accounts or deployment were changed.

## 1. Evaluation result

This module is **partially scaffolded, not implemented end to end, and not ready to charge customers**. Stripe routes and billing screens exist, but they do not yet establish trustworthy subscription access or enforce generation budgets.

The recommended order is: resolve the account/schema contract, protect identity and billing data, synchronize Stripe reliably, enforce atomic usage limits everywhere money is spent, then connect the customer screens and verify a hosted customer journey. A working pricing button is not the completion criterion.

This plan supersedes the previous day-by-day schedule. Each phase has a bounded deliverable and a verification gate; calendar estimates should follow the unresolved decisions and staging checks, not precede them.

### Repository evidence

These findings describe the **starting commit `5c9753c`**, not current completed patches or
live Supabase/Stripe accounts. The Stripe scaffold deficiencies below were addressed by the
guarded backend slice; see [current implementation evidence](../docs/billing/core-implementation.md).

| Area | What exists / what is missing | Existing location |
|---|---|---|
| Account data | Base schema creates `public.users` and an auth signup trigger. Stripe SQL and all three Stripe routes assume `profiles`. Live schema has not been verified. | `db/database_setup.sql`, `db/stripe-schema.sql` |
| Authentication | Cookie-based Supabase clients exist. Landing/pricing login handlers set `demo_auth` instead of authenticating; logout deletes that cookie. | `src/lib/supabase/{client,server}.ts`, `src/app/page.tsx`, `src/app/pricing/page.tsx`, `src/app/(dashboard)/layout.tsx` |
| Request proxy | Existing `src/proxy.ts` redirects the landing page to workspaces and otherwise passes requests through. It does not refresh sessions or enforce access. This is Next.js 16; do not add a competing `middleware.ts`. | `src/proxy.ts`, `package.json` |
| Checkout | Auth check exists, but caller supplies any `priceId`; customer mapping writes are unchecked; duplicate customer/subscription attempts are not controlled. | `src/app/api/stripe/checkout/route.ts` |
| Portal | Auth check exists, but uses the unresolved `profiles` table. Plain-text errors do not match the billing screen's JSON handling. | `src/app/api/stripe/portal/route.ts` |
| Stripe client | Dummy-key fallback and an older API version forced through `as any`. Installed Stripe dependency is `^22.3.2`; version compatibility needs verification. | `src/lib/stripe-server.ts`, `package.json`, lockfile |
| Webhook | Signature verification exists. Checkout completion blindly sets active; subscription updates/deletion update status only; database errors are ignored. No durable event processing, renewal entitlement policy, or reconciliation. | `src/app/api/stripe/webhook/route.ts` |
| Pricing / billing | Pricing tiers and CTAs are scaffolded; billing plan, usage, renewal date, and invoices are hardcoded. | `src/app/pricing/page.tsx`, `src/app/(dashboard)/billing/page.tsx` |
| Channel creation | Browser inserts directly into `workspaces`, without a server-owned quota transaction or explicit owner in the submitted row. Live defaults must be checked. | `src/features/workspaces/components/WorkspaceForm.tsx` |
| Project creation | Main form calls `createProjectWithActs`. Alternate `createAndGenerateVideo` spends on script/outlines before inserting the project. Both need enforcement before provider calls. | `src/features/videos/components/NewVideoForm.tsx`, `src/features/video-generation/server/whiteboard-actions.ts`, `src/features/videos/server/video-actions.ts` |
| Paid AI paths | Images, clips, narration/transcription, script regeneration, thumbnails, and channel analysis have separate entry points; no shared metering contract. | Integration inventory in Phase 7 |
| Background work | Autopilot uses the request-cookie Supabase helper and request-bound actions inside a worker; no trusted persisted billing/job context. | `src/trigger/autopilot.ts` |
| Rendering | Mode follows global Lambda configuration, not subscription eligibility. POST/GET lack explicit auth/ownership checks; progress is in memory. | `src/app/api/render-remotion/route.ts`, `src/server/rendering/*` |
| Hosted durability | Several generation/status paths write to `public/` and upload in the background. Their current local URLs are not sufficient for a serverless paid service. | Plan 24; AI providers; media status route |
| Tests / migrations | SQL is manually applied; file existence does not prove it ran. No dedicated test script/framework in package scripts; ESLint currently ignores `src/**`. | `db/README.md`, `package.json`, `eslint.config.mjs` |

### Corrections to the original proposal

- Do not add subscription authority to a user-editable profile row. The base schema permits users to update their own `users` row.
- Do not assume `profiles` exists, or create a second identity table just to make existing Stripe code compile.
- Do not use “check counter, run provider, increment counter.” Concurrent requests can all pass the check.
- Do not rely on Stripe to deduplicate application side effects, or treat delivery order as reliable.
- Do not grant paid access from a success URL, session query parameter, or checkout-completed event alone.
- Do not reset usage on every subscription update, upgrade, or cancellation; this creates refill/retrial loopholes.
- Do not gate every authenticated page behind an active subscription. Customers must retain billing recovery and account access.
- Do not equate one project with a bounded cost: retries, narration, images, thumbnails, and exports can multiply spending.
- Do not market team seats, voice cloning, automatic posting, or unlimited generation without verified implementations and cost limits.
- Do not promise “local rendering” to ordinary hosted customers: current local rendering runs on the app server, not the customer's computer.

## 2. Product decisions and launch boundary

Confirmed on 2026-10-06: **sample preview only; paid generation after checkout**, **prices remain provisional and sales must not be enabled**, and **no separate staging environment exists yet**. The other proposals below require confirmation during Phase 0.

Subsequently authorized: continue offline implementation before configuration, using one personal billing account per user and deferring teams. Staging and commercial approvals block application/activation of the relevant changes, not isolated schema drafts, pure policy code, or mocked tests.

| Decision | Recommendation for the first release | Confirmation required |
|---|---|---|
| Trial / demo | Approved: pre-generated sample preview, with paid generation after checkout. No free provider-backed trial. | Confirm sample content/placement; trial implementation is out of MVP scope |
| Price proposals | Preserve Creator $49/mo, Pro $99/mo, Studio $249/mo as placeholders while measuring costs. | Currency, target customers, margin, and final prices |
| Annual proposals | Previous draft: $420 / $864 / $2,148 per year, equivalent to $35 / $72 / $179 per month, billed annually. | Annual discount and launch availability |
| Channel limits | Draft: 1 / 3 / 10 workspaces. In this product a workspace is the channel container, not proof of a connected publishing account. | Approve limits and downgrade behavior |
| Project limits | Draft: 4 / 15 / 50 new projects per monthly allowance window. These are not sufficient cost controls on their own. | What qualifies as a billable project; failed/deleted project policy |
| Duration / acts | Explicit supported duration options and finite scene/act limits per tier. Derive from existing generation rules; reject unknown options. | Maximum duration per tier; do not retain “unlimited acts” |
| Paid resources | Separate finite budgets for image outputs, generated clip seconds, narration characters, transcription seconds, LLM work, render minutes, and storage. | Exact allowances, provider/model availability, regeneration policy |
| Hosted exports | Limited cloud rendering for every sellable hosted tier; higher tiers receive larger allowances. | Alternatively withhold exports from lower tiers and disclose clearly |
| Billing ownership | One personal billing account per auth user for MVP, covering that user's workspaces. | Team/organization billing is deferred |
| Payment failure | Stop new costly operations; preserve owned content and billing recovery. No implicit grace period. | Whether to offer a bounded grace period |
| Existing users | Explicit migration/grandfather policy; no automatic lifetime entitlement or new trial. | Which accounts receive temporary access, if any? |
| Refunds / disputes | Manual, audited support policy initially; defined rules for generation access. | Refund eligibility, dispute response, unused allowance behavior |

Phase 0 must produce a cost worksheet using representative short and long projects, vendor price pages, actual staging usage, retries, rendering, storage/egress, payment fees, and support headroom. No claim that $49/$99/$249 is profitable is established by this review.

**MVP includes:** real auth, approved paid tiers, checkout/portal, subscription synchronization, bounded usage, secure hosted generation/export for enabled features, truthful pricing, onboarding, real billing data, tests, and recovery procedures.

**Deferred:** team seats/invitations, enterprise automation, overage charging, purchasable credit packs, referral systems, coupons, new voice-cloning capabilities, automatic publishing, and a full redesign of the generation pipeline. Existing capabilities can be enabled only if verified and covered by the same authorization/metering boundary.

## 3. Where the module belongs

Keep the existing feature-based organization. Routes remain HTTP adapters; product actions remain in their existing features.

Proposed paths below do not exist yet. Start with the necessary files; split services only when their responsibilities justify it.

```text
src/features/billing/
  plans.ts                         browser-safe approved catalog
  types.ts                         billing DTOs and error codes
  components/                      pricing / usage / billing client UI
  server/billing-actions.ts        authenticated read/portal adapters

src/server/auth/
  authorization.ts                 trusted actor and ownership guards

src/server/billing/
  config.ts                        validated server-only configuration
  repository.ts                    protected DB reads/writes
  entitlements.ts                  deterministic access/feature policy
  stripe-service.ts                customer / checkout / portal
  webhook-handler.ts               durable subscription synchronization
  usage.ts                         atomic reservation / settlement API
  periods.ts                       monthly allowance boundaries
  reconciliation.ts                event and operation recovery

src/server/generation/
  metered-generation.ts            shared boundary for enabled paid calls

src/server/rendering/               existing render services; extend in place
src/lib/supabase/                   existing clients; add proxy/admin utilities
src/app/api/stripe/*/route.ts        existing endpoints; retain URLs
src/app/api/media/*                 existing endpoints; retain URLs
src/proxy.ts                       update existing file

db/
  add-billing-accounts.sql          proposed additive migration
  add-billing-usage.sql             proposed usage/operation migration
  secure-billing-resource-writes.sql proposed grants/RPC/ownership migration

tests/billing/                     proposed policy / API / SQL / lifecycle tests
```

Billing code must be server-only when it touches Stripe secrets, service-role keys, authoritative entitlement state, or usage writes. The public catalog contains no secret keys or customer data. Billing rules are deterministic code and SQL, **not runtime AI decisions**.

### Data contract — review before applying SQL

| Record | Purpose and required invariants |
|---|---|
| `billing_accounts` | Stable internal account ID, unique user mapping, unique Stripe customer mapping per environment, permanent trial eligibility/history. Browser cannot modify it. |
| `billing_subscriptions` | Stripe subscription ID, account, recognized price/tier, status, item/period fields appropriate to the pinned API, trial dates, cancellation flags, paid-through/access horizon, reconciliation timestamp. Preserve historical subscriptions; select one current product subscription. |
| `billing_webhook_events` | Unique event ID, type, associated account/object, received/processing/completed/error state, attempts and safe diagnostic metadata. Only mark complete after committed effects. |
| `billing_usage_periods` | Unique account + allowance window + metric, used/reserved quantities and limits/catalog version. No destructive monthly counter reset. |
| `billing_operations` | Account/project, unique scoped operation key, immutable validated input fingerprint, metric reservations, state, provider request/job ID, settlement and retry history. Survives project deletion when required for accounting. |
| `billing_operation_items` | Original quantities per operation/metric; composite foreign keys ensure operation, account, allowance period and metric match. Private and immutable to ordinary service-role updates. |

Use integer quantities in defined units. Keep invoices/payment methods in Stripe; store only identifiers and necessary billing projections. Do not copy card details. Confirm retention/account-deletion requirements before choosing cascading deletes for financial records.

## 4. Phase roadmap and model assignments

**Implementation versus activation:** configuration is deferred by user choice. Develop isolated slices against explicit contracts and mocks now; do not apply migrations, connect paid providers, change existing customer access, or enable checkout until the relevant schema/configuration/commercial gates pass. Full phase completion still requires its stated integration evidence.

Model recommendations are for the **coding assistant doing implementation**, not a change to the app's script, image, or narration models.

GPT-6.1 Sol is the default cost-conscious implementation choice; OpenAI describes it as suitable for complex coding at lower cost than Astra. Luna fits focused repeatable tasks. These phase assignments and effort levels are engineering recommendations, not guarantees of correctness or account availability. See [OpenAI model guidance](https://developers.openai.com/api/docs/guides/latest-model) and [Work/Codex model selection](https://learn.chatgpt.com/docs/models).

| Phase | Deliverable | Dependencies | Recommended model / effort |
|---|---|---|---|
| 0 | Live-state verification and approved product/cost decisions | Repository review completed | GPT-6.1 Sol — High |
| 1 | Protected schema and safe migration | 0 account/data contract | GPT-6.1 Sol — High |
| 2 | Real auth and ownership boundary | 0; 1 for billing-linked reads | GPT-6.1 Sol — High |
| 3 | Shared catalog and entitlement policy | 0–2 | GPT-6.1 Sol — High |
| 4 | Stripe test checkout and portal | 1–3 | GPT-6.1 Sol — High |
| 5 | Durable webhook processing and reconciliation | 1, 3, 4 | GPT-6.1 Sol — High; optional Astra review |
| 6 | Atomic usage reservations and settlement | 1, 3, 5 | GPT-6.1 Sol — High; optional Astra review |
| 7 | Enforce all enabled generation entry points | 2, 3, 6 | GPT-6.1 Sol — High |
| 8 | Secure hosted exports and durable jobs/assets | 2, 3, 6; hosted dependency checks | GPT-6.1 Sol — High |
| 9 | Pricing, real signup/login, onboarding | 2–8 backend gates | GPT-6.1 Sol — Medium |
| 10 | Live billing and usage dashboard | 3–6, 9 | GPT-6.1 Sol — Medium |
| 11 | Fault testing, staging approval, controlled launch | All implementation gates | GPT-6.1 Sol — High; optional Astra audit |

Use GPT-6 Luna — High only for bounded copy, FAQ text, documentation, fixture formatting, or mechanical UI work after the contracts are fixed; have Sol review changes affecting billing behavior. Keep Astra optional and focused on webhook ordering, SQL security, concurrency, or the final security review. Sol can handle the complete plan without Astra.

Do not automatically switch models, spawn agents, or use Max/Ultra across the whole project. Work one phase/small patch at a time, record findings and test evidence, and consult the account usage dashboard before any optional model escalation. No exact token/credit consumption can be predicted from this plan.

## 5. Detailed phases

### Phase 0 — Confirm live state and commercial constraints

**Objective:** eliminate assumptions before implementation touches accounts or charging.

**Work:**

1. Record the current branch/commit, dirty-worktree status, enabled routes, runtime target, and baseline typecheck/build/lint results. Re-run for implementation; do not treat the earlier refactor's results as a billing test.
2. Read-only inspect the staging/live schema, auth triggers, grants, RLS, storage policies, and applied SQL history. Resolve `users` versus `profiles`, legacy `credits`/`motion_credits`, and missing owner defaults.
3. Read-only verify Stripe account suitability for the seller, supported currency/payment methods, test/live products, current subscriptions, portal settings, endpoint/API versions, and environment-variable presence. Do not expose secret values or assume production configuration from local files.
4. Confirm the decisions in Section 2. Define billable units, retry/refund policies, entitlement renewal rules, allowed providers, and unsupported launch features.
5. Inspect plan 24's actual deployment status and run small cost/durability probes in staging only after approval of spend and configuration.
6. Establish a test baseline: minimal unit/integration test tooling, two account fixtures, mocked vendor boundaries, and a disposable staging database. No production test charges.

**Files:** plan 25, `db/README.md`, `package.json`/lockfile, `eslint.config.mjs`, plans 10/23/24, existing auth/Stripe/render services. Add test tooling during implementation, not this planning revision.

**Acceptance gate:** schema/account mapping and policy decisions documented; migration prerequisites known; unsupported features excluded; baseline failures recorded. Configuration/dashboard inspection requires access not yet exercised by this review.

### Phase 1 — Protected billing schema and migration

**Objective:** subscription authority and usage records cannot be forged by the browser.

**Work:**

1. Add the records in Section 3 with foreign keys, uniqueness, state/quantity checks, UTC timestamps, and required lookup indexes.
2. Apply browser ownership-read policies only where needed. Revoke browser insert/update/delete on billing authority and usage records. Keep webhook records private.
3. Restrict any privileged SQL functions: explicit grants, fixed safe search path, validated ownership, no callable “set my tier” function. Avoid broad service-role access in normal request actions.
4. Design transaction interfaces for protected resource creation and quota reservation. Resource creation must not remain bypassable through direct REST inserts.
5. Backfill verified customer/subscription mappings without linking by email alone. Audit conflicting/duplicate mappings and existing users with missing identity rows.
6. Use additive, reviewed migrations and a staging backup. Existing scripts are manually run and may not be safely rerunnable despite broad README claims; do not execute all SQL blindly.
7. Document run order, verification queries, application compatibility, and rollback/cutover procedure. Keep legacy data until reconciliation and rollback windows are satisfied.

**Files:** proposed three billing SQL files, `db/README.md`, `src/server/billing/repository.ts`, proposed `src/lib/supabase/admin.ts`.

**Acceptance gate:** account A cannot read B's billing data; neither can grant credits/tier via REST/RPC; signup/backfill works; existing workspaces/projects remain readable; migrations tested against both fresh and representative existing staging data.

### Phase 2 — Real authentication and resource authorization

**Objective:** every sensitive operation has a verified actor and owned resource.

**Work:**

1. Implement real Supabase login/signup/logout, email confirmation/callback, and recovery flow as required by the approved auth settings. Validate return destinations against internal routes.
2. Add session refresh using the existing `src/proxy.ts` and a Supabase proxy helper. Restore a public landing page; exclude Stripe webhooks from session/paid redirects.
3. Create server-owned guards for user, workspace, project, scene, media, and job ownership. Verify related IDs belong to the same project, not merely the same user.
4. Split dashboard layout into an authenticated server boundary and a client shell where necessary; replace fake identity/logout.
5. Add explicit guards to server actions and API handlers near resource/provider access. Request proxy and hidden buttons are not authorization.
6. Preserve billing, pricing, logout, recovery and owned-content reads for signed-in unsubscribed/expired accounts. Return API errors as structured JSON, not HTML redirects.

**Files:** `src/proxy.ts`, `src/lib/supabase/{server,client}.ts`, proposed `src/lib/supabase/proxy.ts`, `src/server/auth/authorization.ts`, `src/features/auth/components/*`, proposed `src/app/(auth)/*`, `src/app/auth/callback/route.ts`, dashboard layout.

**Acceptance gate:** forged `demo_auth` grants nothing; expired sessions refresh correctly; cross-account IDs cause rejection before vendor calls; unauthenticated API requests return 401; billing recovery has no redirect loop.

Next.js recommends authorization near the data source, not Proxy alone; Supabase documents cookie refresh and validated server identity. [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), [Supabase SSR clients](https://supabase.com/docs/guides/auth/server-side/nextjs).

### Phase 3 — Catalog and deterministic entitlements

**Objective:** pricing UI and server enforcement express the same approved offer.

**Work:**

1. Define typed tier IDs, interval, currency/amount, numeric limits, supported duration options, provider allowlist, and feature flags in the public catalog.
2. Keep Stripe price resolution in server configuration. Validate each allowlisted price's tier, amount, currency, interval, active/test-live status, and product.
3. Implement one entitlement policy using protected subscription state, access horizon, trial eligibility, and catalog version.
4. Explicitly handle these states:

| State | Proposed operation policy |
|---|---|
| No subscription / sample-only | Sample preview and recovery/account access; no paid generation |
| Eligible unexpired trial, if approved | Only its separate finite trial allowance |
| Verified active paid subscription | Tier features and remaining allowance within the verified access horizon |
| Active with cancellation scheduled | Keep paid access until the verified end; disclose cancellation date |
| Initial payment incomplete / requires action | No new paid generation; allow completing payment |
| Past due | Stop new costly operations; allow billing recovery and owned content |
| Unpaid / paused / canceled / expired trial | No new costly operations; preserve account/content per retention policy |
| Unknown price or unavailable billing state | Fail closed for costly operations; explain and alert, do not invent a tier |

5. Distinguish scheduled cancellation, immediate cancellation, and `pause_collection` from subscription status. Handle resumes and delinquency recovery explicitly.
6. Validate duration before outlines/scripts and actual length before costly follow-on work. Current duration tiers range through 30 minutes/11 acts; “max acts” alone is not a reliable duration budget.
7. Freeze operation pricing/limit version; never accept tier, credits, owner, or trial eligibility from client input.

**Files:** `src/features/billing/{plans,types}.ts`, `src/server/billing/{config,entitlements,periods}.ts`; consume `src/lib/ai/generation-rules.ts` rather than duplicate its duration resolver.

**Acceptance gate:** table-driven tests cover every state and boundary timestamp; public display matches approved server limits; unknown duration/price/provider is rejected. Business policies above are recommendations to confirm in Phase 0.

### Phase 4 — Stripe products, checkout, and customer portal

**Objective:** test subscriptions can be purchased and managed safely, without enabling public sales yet.

**Work:**

1. Create/verify approved products and monthly/annual prices in test mode; keep environment mappings separate. Confirm portal products, cancellation behavior, upgrades/downgrades, and proration.
2. Pin a supported Stripe API contract compatible with the installed SDK and configured webhook version. Remove dummy secret fallbacks and version casts; missing configuration produces a controlled error.
3. Checkout accepts validated `planId` + `interval` + a scoped attempt token, not an arbitrary price/customer/user ID.
4. Create/reuse the authenticated user's customer mapping with persisted attempt keys, uniqueness, checked writes, and idempotent Stripe requests.
5. Prevent a second live subscription for the same product/account. Resume eligible incomplete attempts or use the portal for changes.
6. Set trusted account metadata on both the Checkout Session and subscription creation data. Do not infer ownership from user-editable email.
7. Use fixed configured success/cancel/return origins; rate-limit session creation; keep errors safe and JSON-shaped.
8. Show checkout success as “confirming subscription” until authoritative synchronization succeeds.
9. If a trial is approved, implement the supported **Checkout** trial mechanism for the pinned API, payment-method/end behavior, reminder disclosures, and persisted one-time eligibility. The newer Trial Offer API is not currently supported by Checkout; do not introduce it automatically.

**Files:** existing `src/app/api/stripe/{checkout,portal}/route.ts`, `src/lib/stripe-server.ts`, `src/server/billing/{config,stripe-service,repository}.ts`; add only non-secret env documentation/template entries.

**Acceptance gate:** unknown/tampered prices fail; double-click/retry creates no duplicate subscription; DB mapping errors cannot become success; portal opens only for the current customer's mapping; SCA, cancellation and failed checkout are recoverable.

Stripe's request idempotency supports retries but does not replace persistent application attempt tracking. [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests). Checkout trial compatibility must be checked separately. [Stripe trial limitations](https://docs.stripe.com/billing/subscriptions/trials).

### Phase 5 — Durable webhook lifecycle and reconciliation

**Objective:** subscription state remains correct through duplicates, failures, missing events, and reordering.

**Work:**

1. Verify signature against the raw body, then durably record the event. For a valid handled event, acknowledge only after committed processing or durable retryable enqueue; do not return 200 for a lost DB write.
2. Use unique event IDs and idempotent business keys for grants/period creation. A received/in-progress event is not necessarily completed.
3. Process customer/subscription lifecycle, `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, and payment-action/expiration/trial events required by the approved payment flow.
4. Reconcile the current recognized subscription and invoice state instead of blindly applying an old event snapshot. Serialize processing per billing account with durable coordination/fencing so an older fetch cannot overwrite a later result.
5. Confirm customer/account/subscription/price mappings; unknown objects are quarantined with diagnostics, not granted access.
6. Extend verified access and create allowance windows once for the appropriate paid subscription cycle. Trial/zero-value/proration invoices and ordinary updates must not accidentally refill usage.
7. Cancellation never resets trial eligibility or deletes workspaces/projects. Later events from historical subscriptions must not downgrade a replacement current subscription.
8. Add a scheduled reconciliation job plus an audited manual recovery procedure for failed events, missed renewals, and stale state. Record alerts without raw secrets or excessive personal data.

**Files:** existing webhook route; `src/server/billing/{webhook-handler,repository,reconciliation}.ts`; proposed `src/trigger/billing-reconciliation.ts` using the existing job platform if configured.

**Acceptance gate:** replay and reversed delivery converge to correct state; simultaneous handlers do not double-grant; DB outage is recoverable; a missing webhook can be reconciled; old subscriptions cannot override the current one.

Stripe explicitly documents duplicate and unordered delivery. [Webhook delivery behavior](https://docs.stripe.com/webhooks). Renewals require checking the subscription as well as invoice payment. [Subscription lifecycle events](https://docs.stripe.com/billing/subscriptions/webhooks).

### Phase 6 — Atomic usage engine

**Objective:** quotas remain valid under concurrency, retries, and partial failure.

**Work:**

1. Implement atomic reserve/commit/release transitions in SQL, exposed through a small server service. Lock the relevant account/period rows or use equivalent conditional updates.
2. Require `used + reserved + request <= limit` for every metric in a multi-resource operation; all reservations succeed together or none do.
3. Scope operation keys to trusted account/resource/input version. Retries reuse the original operation; an intentional regeneration gets a new bounded operation.
4. Persist before invoking providers. Track accepted vendor IDs and terminal outcomes; settle quota exactly once through legal state transitions.
5. Separate customer consumption from vendor cost. Genuine no-work rejection may release a reservation; completed provider work with failed storage delivery may need repair/support credit, not a blind free retry.
6. Keep unknown submission outcomes unresolved until reconciled. Do not refund/resubmit merely because a timeout or status fetch failed. Use vendor idempotency only where supported; do not claim universal exactly-once provider execution.
7. Handle mock/stock-fallback work without charging paid-generation units; still bound bandwidth, request rate and concurrency. A fallback after an ambiguous accepted submission needs reconciliation.
8. Channel capacity is an atomic count/create rule. New-project allowance is a durable ledger that cannot be replenished by deleting a project.
9. Monthly subscriptions use approved cycle windows. Annual subscriptions receive deterministic monthly sub-windows anchored to the annual period, not twelve months of quota at once. Define month-end/leap-year behavior in UTC.
10. No destructive resets. Upgrades retain usage and apply the approved allowance difference; downgrades retain data and restrict additional work when over the new limit. In-flight jobs settle against their original reserved window.
11. Add bounded stale-operation recovery, rate limits, max input/output sizes, and per-account concurrency controls. No in-memory counter as quota authority.

**Files:** billing usage SQL, `src/server/billing/{usage,periods,repository,reconciliation}.ts`, `tests/billing/*`.

**Acceptance gate:** with one unit remaining, concurrent requests cannot accept more than one unit; retries/double polling settle once; annual/month-end boundaries pass; project deletion, cancellation, tier changes, and worker retries cannot refill allowances.

### Phase 7 — Integrate every enabled generation path

**Objective:** no reachable paid provider call bypasses identity, ownership, entitlement, and reservation checks.

Complete these as separate small implementation slices rather than one large rewrite.

| Slice | Existing entry points / dependencies | Required integration |
|---|---|---|
| 7A Channel/project creation | `WorkspaceForm.tsx`, `workspaces/server/workspace-actions.ts`, `NewVideoForm.tsx`, `whiteboard-actions.ts`, `videos/server/video-actions.ts` | Trusted owner, atomic channel/project creation, duration/act/scene caps **before** AI calls; remove direct-insert quota bypass without breaking legitimate editing |
| 7B Scripts and planning | `api/ai/brainstorm/route.ts`, `video-generation/server/{whiteboard,slicer,orchestrator}-actions.ts`, `lib/ai/script-writer.ts`, `lib/ai/agents/*` | Meter brainstorming, outlines, script writing/rewrites, slicing, casting, enrichment and safety calls; bound input/output tokens and batches |
| 7B Channel analysis | `channel-settings/server/{format,fact}-actions.ts`, format/fact agents | Meter blueprint and fact generation even before the first project exists |
| 7C Images / clips | `api/media/generate/route.ts`, `api/media/[mediaId]/status/route.ts`, media actions, `lib/ai/providers/{registry,gemini-image,fal,types}.ts` | Unified server dispatcher; validate project/provider/model/options; reserve before start; persist pending request and settle independently of browser polling |
| 7C Thumbnails | `thumbnails/server/thumbnail-actions.ts`, `lib/ai/thumbnail-orchestrator.ts`, thumbnail-composer agent | Cover direct Gemini calls, key art, composition passes, and each candidate/regeneration; no duplicate nested charge |
| 7C Audio | `audio/server/audio-actions.ts`, `lib/ai/{openai-tts,elevenlabs,local-tts}.ts` | Meter scene/act/full narration, re-recording and Deepgram transcription; enforce voice/provider, text-size and concurrency policies |
| 7D Editing / stock | `timeline-editor/server/combo-actions.ts`, `video-generation/server/scout-actions.ts`, `api/stock-media/route.ts` | Guard any AI edit-director calls; validate scene/project relationship; bound stock searches/downloads separately from paid generation |
| 7D Worker | `src/trigger/autopilot.ts` and enqueue path | Persist trusted job/owner context, load authoritative project/acts, use worker-safe DB client and shared services instead of Next request cookies; recheck on resume |
| 7D Upload / URL / sync | `api/media/{upload,from-url}/route.ts`, `api/sync-timeline-assets/route.ts` | Ownership, upload/storage limits, controlled external fetches and private-asset access; prevent storage/bandwidth bypass |
| Demo endpoint | `api/ai/generate-script/route.ts` | Keep clearly identified mock behavior; no false paid-feature claim. Gate/meter before enabling a real provider |

**Implementation contract:** verified actor -> owned resource and validated options -> entitlement -> atomic reservation -> provider/job -> durable result -> settlement. Nested calls carry trusted operation context; each metered resource has one settlement owner. Lower-level provider helpers are server-only and must not expose unguarded alternate request paths.

**Files:** integration table plus proposed `src/server/generation/metered-generation.ts`. Extract only the shared worker/request boundary needed; do not rewrite all agents.

**Acceptance gate:** enumerate all external paid call sites with `rg`; each is guarded/metered or explicitly disabled in production. Two-account, exhausted-quota, unauthenticated and retry tests prove **zero provider calls on rejection**. Existing step-by-step and enabled autopilot workflows still pass.

### Phase 8 — Hosted rendering, jobs, and asset durability

**Objective:** an enabled paid export is authorized, bounded, resumable, and delivered privately.

**Work:**

1. Authorize render POST, progress GET, and download by owned project/job. Select render mode from deployment capability and approved entitlement, not a client field or global config alone.
2. Validate an owned timeline snapshot and media references server-side. Bound frames, dimensions, duration, tracks, concurrent renders and render attempts before S3 synchronization or Lambda submission.
3. Prevent arbitrary filesystem paths and uncontrolled external URL fetches; validate redirects/DNS/network destinations as needed. Do not pass user-supplied URLs into privileged fetches without a reviewed boundary.
4. Store render jobs/provider IDs/progress/results durably, replacing in-memory state as production authority. Duplicate submits and polls must not create extra jobs/charges.
5. Reserve render budget before submission; apply Phase 6 settlement/reconciliation to terminal and unknown outcomes.
6. Await durable media/audio/thumbnail storage on hosted paths. Coordinate only the required fixes with plan 24; a local `public/` write/background upload cannot be the launch contract.
7. Use owned storage objects and appropriately scoped signed playback/export URLs. Support server-renderer access and expiry windows without leaking other projects. Plan compatibility for existing public URLs.
8. Test enabled narration/voice selection in the target deployment. A local Voice Studio connection is not automatically usable by hosted customers.
9. Preserve local developer workflows if supported; do not advertise local desktop export unless separately implemented.

**Files:** `src/app/api/render-remotion/route.ts`, `src/app/api/render/download/route.ts`, `src/server/rendering/{render-payload,render-progress-store,lambda-renderer,local-renderer,s3-sync}.ts`, affected providers/status/thumbnails, Supabase storage helper/policies, proposed job migration/service.

**Acceptance gate:** hosted paid generation-to-export survives restart/multiple instances and browser closure; account B cannot poll/download A's job; repeated export is bounded; no required operation writes to a read-only hosted directory. Unsupported paths stay disabled and absent from sales copy.

### Phase 9 — Pricing, auth entry, and onboarding

**Objective:** customers understand the real offer and reach an authorized first project.

**Work:**

1. Render landing/pricing from the catalog, including real monthly/yearly selection, annual total, disabled unavailable tiers and truthful FAQ answers.
2. Connect CTAs to validated checkout; signed-out visitors authenticate first with safe preserved tier/interval intent. Prevent double submission and show actionable failures.
3. Remove `demo_auth` handlers and fake benefits. Reuse Phase 2 auth forms rather than create a second login system.
4. Implement resumable onboarding with the existing workspace wizard and channel-format feature. Determine completion from saved state; no duplicate workspaces or unbounded blueprint generation on refresh.
5. Provide the approved sample/trial experience. If sample-only, do not make paid AI calls to create a “free demo.” If trial, use its separate metered allowance and watermark policy.
6. On checkout return, verify session ownership server-side and show pending/failed/confirmed synchronization states. A URL parameter is not proof of purchase.
7. Define UI behavior for over-limit resources, expired accounts, canceled accounts, and unsupported features without hiding recovery paths.

**Files:** `src/app/page.tsx`, `src/app/pricing/page.tsx`, proposed billing components, `src/app/onboarding/page.tsx`, `src/features/onboarding/components/*`, existing workspace form and channel settings.

**Acceptance gate:** signed-out -> auth -> checkout -> confirmation -> resumable onboarding -> first allowed project succeeds; refresh/back/canceled checkout is safe; displayed claims match backend enforcement.

### Phase 10 — Live billing and usage dashboard

**Objective:** customers see their actual plan, remaining allowance, and recovery options.

**Work:**

1. Replace all mock plan, renewal, credit and invoice data with protected account reads and server-side Stripe invoice retrieval for the mapped customer.
2. Show every advertised allowance consistently: used/reserved/remaining, window end, trial end, scheduled cancellation, payment action/failure, and pending synchronization.
3. Explain annual billing versus monthly allowance refresh; do not fabricate renewal dates or treat the next allowance window as a charge date.
4. Display real invoice amounts/currency/status and hosted invoice/PDF links with bounded pagination. Do not expose unrelated customer data or internal event payloads.
5. Connect portal/upgrade controls with loading/error states; no-customer accounts receive a useful checkout action.
6. Supply real sidebar identity/tier and quota errors such as `AUTH_REQUIRED`, `SUBSCRIPTION_REQUIRED`, `LIMIT_REACHED`, `FEATURE_UNAVAILABLE`, and `BILLING_SYNC_PENDING`.

**Files:** `src/app/(dashboard)/billing/page.tsx`, dashboard shell/layout, `src/features/billing/{components,server/billing-actions.ts}`, billing repository/service.

**Acceptance gate:** dashboard and enforced limits agree for two different accounts; annual/trial/canceled/delinquent/no-customer states render accurately; invoices and portal cannot cross account boundaries.

### Phase 11 — Staging verification and controlled launch

**Objective:** demonstrate correct money/access behavior before enabling sales.

**Required tests:**

- Unit: catalog, status policy, trial eligibility, duration/provider limits, annual/month-end periods, upgrade/downgrade accounting, legal operation transitions.
- SQL/integration: RLS/grants/RPC, direct REST bypass attempts, concurrent final-unit reservations, atomic resource creation, duplicate settlement, backfill and migration compatibility.
- Stripe sandbox: actual app-linked checkout, card failure/SCA, portal changes, renewal, canceled-at-end, immediate cancellation, recovery, and trial expiry if enabled. Use test clocks where supported; generic CLI fixtures alone do not prove the customer mapping.
- Faults: duplicate/out-of-order events, old subscription events, missing events, DB/API outage, lost provider response, accepted-but-unpersisted submission, storage failure, repeated polling, worker retry/restart, process restart and browser closure.
- Security: unauthenticated access, cross-account IDs, price/tier/customer tampering, arbitrary URLs/paths, private output access, and browser attempts to rewrite billing authority.
- End-to-end: signup -> approved offer -> checkout -> webhook/reconciliation -> onboarding -> generation -> durable cloud export -> billing/portal -> cancellation/recovery.
- Regression: existing workspace settings, whiteboard, timeline editing, scene board, thumbnails, and enabled narration/local development flows.
- Tooling: `npm run typecheck`, `npm run build`, targeted lint of changed code, new billing tests, and `git diff --check`. Fix/expose billing-file lint coverage; a globally ignored `src/**` is not a passing code-quality check. Record unrelated baseline failures separately.

**Launch checklist:**

1. Obtain sign-off on pricing, trial rules, supported features, retention/refunds, and staging evidence.
2. Validate live keys/price mappings/webhook signing/API version/portal settings and configured origin without printing secrets.
3. Apply reviewed migrations with backup and documented cutover; reconciliation verifies existing mappings before enforcing newly paid access.
4. Enable a small cohort with provider spend caps, alerts, failed-event/unknown-operation visibility, and a kill switch for new expensive work.
5. Document support/reconciliation procedures, deployment/job configuration, env names, monitoring and rollback.
6. Rollback disables new purchases/costly operations and restores compatible app behavior; it does not delete billing history, erase projects, reset trials, or mark everything processed.
7. Broaden launch only after observing correct charges, entitlement sync, quota settlement and hosted delivery.

**Files:** `tests/billing/*`, package scripts/test config, narrowly scoped lint config, operational documentation and environment template; implementation paths from preceding phases.

**Acceptance gate:** all critical lifecycle/security/concurrency/hosted tests pass with recorded evidence; any excluded capability is disabled and disclosed. Typecheck/build alone do not establish readiness.

## 6. Execution discipline and definition of done

Each phase should be delivered as small reviewable patches:

1. Confirm inputs, dependencies and the exact paths to touch.
2. Implement only that phase/slice; preserve unrelated user changes.
3. Run its acceptance tests and relevant regressions.
4. Update this document with completed work, test evidence, remaining decisions and blockers.
5. Move to the next dependency only when the gate passes. Never mark “done” just because the screen exists.

Phase 0's repository investigation/readiness tooling are complete; its configuration work is
deferred. Local backend slices now cover Phase 1's protected drafts, Phase 2's trusted server
authorization, Phase 3's approved-catalog/status policies, Phase 4's guarded checkout/portal,
Phase 5's signed/durable/fenced event application, Phase 6's atomic usage/window engine, and
Phase 7's shared metered dispatcher. These are **implementation slices, not completed phases**:
auth UI/session refresh, account provisioning/backfill, scheduled recovery, provider-specific
integration, hosted rendering, customer screens and staging acceptance remain pending.

See [billing core evidence](../docs/billing/core-implementation.md) for current paths, tests and
limitations, [initial foundation evidence](../docs/billing/foundation.md) for the first slice,
and [configuration handoff](../docs/billing/phase-0-readiness.md) for deferred account-owner
tasks. Continue local implementation of the auth/customer journey and recovery paths, then
integrate generation in the small Phase 7 slices. Configuration is not a blanket development
blocker, but is mandatory before real integration tests or activation.

Local commands: `npm run test:billing`, `npm run lint:billing`, and `npm run check:billing`. The readiness command is offline, does not print secret values, and intentionally exits nonzero when format/configuration checks fail. Passing it is not approval to enable sales.

The module is done when a legitimate customer can buy an approved offer, receive the correct bounded access, generate/export successfully on the deployed system, inspect real billing, and cancel/recover—while forged requests, duplicate events and concurrent retries cannot obtain someone else's content, refill quotas or create uncontrolled vendor spend.

## 7. Source notes

Official documentation was checked on 2026-10-06. API/version details should be rechecked during implementation against the installed dependencies and Stripe endpoint contract.

- Model roles and selection: [OpenAI GPT-6 guidance](https://developers.openai.com/api/docs/guides/latest-model), [Work/Codex models](https://learn.chatgpt.com/docs/models).
- Next.js 16 convention: [Proxy](https://nextjs.org/docs/app/getting-started/proxy).
- Authentication boundaries: [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), [Supabase server-side clients](https://supabase.com/docs/guides/auth/server-side/nextjs).
- Database access: [Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security).
- Stripe lifecycle: [Webhooks](https://docs.stripe.com/webhooks), [Subscription events](https://docs.stripe.com/billing/subscriptions/webhooks), [Idempotent requests](https://docs.stripe.com/api/idempotent_requests).
- Stripe trial/portal configuration: [Trial integration limitations](https://docs.stripe.com/billing/subscriptions/trials), [Customer portal](https://docs.stripe.com/customer-management).

The database design, phase ordering, resource budgets, state-access policy, and model effort assignments are project-specific recommendations inferred from this repository review. The remote schema, live Stripe setup, production behavior and actual profitability have not been verified.
