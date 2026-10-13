# Phases 8–10: background jobs, sandbox billing and allowances

Date: October 13, 2026. Plan: [29](../../implementation_plans/29-account-access-and-vercel-launch-plan.md).

Current instruction: **local testing first; do not deploy yet. Sales remain disabled and the approved catalog stays empty.** No remote migration, customer creation, checkout, provider request, render or deployment was performed during implementation.

## What was implemented

| Phase | Local implementation | Acceptance still pending |
|---|---|---|
| 7 | Saved/resumable owned setup and first metadata draft, reverified with later migrations | Actual configured account/browser test |
| 8 | Durable SQL queue, immutable input/version, claims and leases, cancellation before submission, retained uncertainty, scheduled dispatch, private results, mock worker, bounded hosted script and versioned cloud topic preview | Worker configuration, actual Supabase concurrency, limited provider/render acceptance |
| 9 | Confirmed personal billing enrollment, existing checkout/portal/signed webhooks connected behind sandbox gates, verified return state, invoice reads and bounded reconciliation | Approved catalog, Stripe sandbox keys/portal/webhook deliveries and lifecycle tests |
| 10 | Atomic reservation plus queue insert, current entitlement checks at worker start, original-window settlement, database resource quotas, live account/usage view, kill switches and recovery visibility | Approved limits, matching database catalog, actual concurrent quota tests and provider acceptance |

These are code-delivery milestones. They do not complete the full customer launch or every provider class. The operation inventory below defines the supported lanes precisely.

## Test locally now

From the repository directory:

```powershell
npm run dev
```

Open `http://localhost:3000`. The root remains the landing page. Launch flags default to off, so login/setup/billing/job screens truthfully show unavailable states until the backend is configured. This command does not deploy anything.

Run isolated automated checks without creating real accounts, charging cards or calling providers:

```powershell
npm run test:auth
npm run test:billing
npm run typecheck
npm run lint:auth
npm run lint:access
npm run lint:billing
npm run build
npm run check:account-preview
node scripts/auth/check-worker-build.mjs
```

The auth tests execute the actual ordered SQL in temporary PGlite databases. SDK/provider fixtures isolate network calls. The preview check bundles browser code without rendering or uploading, and explicitly excludes `public/` assets. Some Windows sandbox environments need the local bundle check to run with normal filesystem access to ancestor package directories; this does not authorize deployment.

For a local production HTTP pass, use one terminal for the server and another for the probes:

```powershell
# Server terminal: keep all capability flags off for these probes.
$env:AUTH_LAUNCH_READY='false'
npm run start -- --port 3102
```

```powershell
# Probe terminal
$env:AUTH_SMOKE_ORIGIN='http://localhost:3102'
node scripts/auth/smoke.mjs
```

Stop the temporary server with Ctrl+C after testing. The probes create/remove only a synthetic local containment file.

Once an isolated backend is configured and a mock job is queued from the project page, it can be completed without deploying a worker:

```powershell
npm run run:local-mock -- <saved-mock-job-uuid>
```

Get the saved job UUID from the local `/api/account/jobs?projectId=<owned-project-uuid>` response or the local browser Network panel. This runner requires a configured HTTP localhost origin and accepted auth/ownership/job migrations. It verifies the persisted job is `mock_script` and sets process-only kill switches for both paid lanes. It uses the configured test Supabase backend and is therefore **not** an offline test. It prints only the outcome and makes no provider call; no Trigger/cloud deployment is needed for mock manual acceptance.

### Why localhost still needs a backend

The frontend runs locally, but Supabase handles users, sessions, database records and private storage. Existing `.env` Supabase credentials point to their configured project; localhost does not turn that project into an isolated local database. The [original review](account-access-review-2026-10-11.md) found existing data and ownerless records in that project. Do not enable this migration bundle against it merely to test a new account.

Use an isolated test Supabase project without deploying the frontend, or a local Supabase stack with Docker/CLI. Neither Docker nor the Supabase CLI was found on PATH during this continuation; no stack was installed or started. Set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and configure the matching allowed auth/email return URLs in the selected test backend. Keep secrets out of Git. Preserve existing `.env.local`; add the required settings deliberately using [the configuration template](../../config/auth.env.example).

The local database needs the reviewed core workspace/project/media/scene schema, then the ordered security and billing migrations below. Local automation cannot substitute a fake user for real account checks.

## Reviewed migration order

Apply once to the selected isolated backend after inventory, backup and schema/trigger review. Nothing in this section has been applied remotely.

1. Auth `001` through `007` from [the earlier guides](account-access-phases-3-6-setup.md) and [Phase 7](account-access-phase-7-setup.md).
2. Existing billing drafts, in this exact order:
   - `db/add-billing-accounts.sql`
   - `db/add-billing-usage.sql`
   - `db/add-billing-usage-functions.sql`
   - `db/add-billing-usage-windows.sql`
   - `db/add-billing-checkout.sql`
   - `db/add-billing-webhook-functions.sql`
3. New auth continuation:
   - `db/auth/008-personal-billing-enrollment.sql`
   - `db/auth/009-durable-generation-jobs.sql`
   - `db/auth/010-resource-allowance-boundaries.sql`

Migration 009's paid branches depend on the configuration/catalog tables installed by 010. Apply the complete bundle before activation. Do not apply containment 001 again after billing grants: it deliberately quarantines public-schema privileges. Do not replay `db/database_setup.sql`, old RLS repair files or `db/stripe-schema.sql` over this layout.

Verify the migration owner/trigger functions and real `service_role` BYPASSRLS behavior. The service role receives only required auth identity columns plus owned-resource reads; browser write/privileged RPC access stays denied. Enrollment is idempotent and test-mode only, requires a confirmed nonanonymous unbanned identity and application profile, preserves existing mappings and grants no subscription or allowance. Existing users can enroll through the account billing button; there is no automatic provider-backed trial or customer creation.

## Supported operations and limits

| Operation | Input and allowance boundary | Provider/output |
|---|---|---|
| Onboarding | Saved metadata; three staging workspaces, one first draft per account; paid mode adds database plan/workspace and project-period limits | No provider |
| Mock draft | Owned project plus operation UUID; immutable saved topic; ten lifetime mock jobs per actor, four outstanding jobs | Deterministic private database result; no provider |
| Hosted short script | Owned project; topic ≤200 characters; fixed `short-script-v1`; reserve 4,096 token allowance units atomically before queueing | Pinned GPT-4.1 mini snapshot; 1,024 output-token ceiling; no tools; one submission; private database result ≤32 KiB |
| Cloud topic preview | Owned topic only; fixed `account-preview-v1`; five render seconds plus 3 MiB storage allowance; four outstanding operations | Versioned Remotion title card, 150 frames at 30 fps, 1280×720; private S3 result copied/verified in private Supabase `renders` |
| Other scripts/analysis, image/clip/stock generation, hosted TTS/transcription, thumbnails, suggestions, legacy editor exports, autopilot | Closed before existing work; no environment flag reopens them | Unavailable pending individually accepted adapters |

The short script uses a **fixed ceiling allowance**, not an invoice claiming the vendor consumed exactly 4,096 tokens. Cloud preview similarly commits the reserved 3 MiB allowance even if the file is smaller. These bounds remain proposals until explicit approval; the catalog is intentionally empty, and both paid lanes stay disabled.

The hosted script adapter uses bounded Responses API output, no automatic network retry and `store:false`; see [official OpenAI Responses documentation](https://developers.openai.com/api/reference/python/resources/responses/methods/create) and [the pinned model family](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

Cloud output explicitly requests private access because Remotion's rendered-output default is public; see [renderMediaOnLambda](https://www.remotion.dev/docs/lambda/rendermediaonlambda). Polling uses durable render IDs and IAM reads the exact derived S3 key; no progress URL becomes a general fetch target. The original synchronous renderer, local Chromium and public-file helpers remain inaccessible.

## Activation rules

All flags are false in the template. For configured local testing, enable only the phase you are exercising after its database dependencies pass.

- Metadata/jobs require the auth-only launch flags, owned-content acceptance, `JOBS_MIGRATION_READY=true` and `DURABLE_JOBS_ENABLED=true`. Mock execution additionally requires `MOCK_JOBS_ENABLED=true`. Mock jobs do not need a Stripe plan.
- Sandbox billing requires `BILLING_MIGRATION_READY=true` and `BILLING_STRIPE_MODE=test`. Enrollment, account reads, portal and webhooks do not grant costly access. Keep `BILLING_SALES_ENABLED=false`, `BILLING_ENABLED=false` and the catalog empty as currently requested.
- Future checkout needs approved entries in `src/features/billing/plans.ts` and `src/server/billing/catalog.ts`, exact test price mappings and keys. Env price IDs alone cannot approve a plan. The Stripe SDK/webhook API contract is `2026-06-24.dahlia`; match the endpoint version before testing deliveries.
- Portal, signed webhooks, invoices and reconciliation have independent flags. Turning off sales preserves configured customer recovery. A checkout URL parameter never grants access; `/account/billing` reads verified database state and polls for synchronization. Invoices are retrieved only for the verified mapped test customer; safe Stripe-hosted links are allowlisted.
- Paid jobs additionally require `COSTLY_FEATURES_ENABLED=true`, the specific feature and accepted-bounds flag, provider credentials, current approved entitlement and allowance. The worker rechecks ownership, account state, supported feature/quantity and original current allowance window before submission.
- Migration 010 creates `account_access_configuration.paid_resource_limits=false` and an empty private `account_approved_resource_plans`. Paid jobs refuse to start before that database switch is on. Install the same approved plan/version/workspace limit as server code, then set the switch during explicit local/staging acceptance. Browser/service-role config writes are not granted. Workspace limits are capped at three in this testing milestone; larger commercial limits require a reviewed change to the existing owned RPC and catalog guard.
- Paid project creation increments the current `projects` allowance and writes a permanent resource receipt inside the insert transaction. Deleting content or completing onboarding twice does not refill quota. Unknown-owner content is preserved, not adopted by a new account.

## Worker execution and future cloud configuration

No worker or cloud bundle was deployed. `trigger.config.ts` now uses the installed SDK configuration shape and deploys only `src/trigger/account-access`. It excludes legacy autopilot imports and request-bound Next cookies APIs. Existing external autopilot deployments must be retired separately before hosted activation.

`account-generation-v1` executes a claimed job; the payload contains only a job UUID. Scheduled dispatch retrieves the bounded database queue every minute. The database enforces claims independently of Trigger dispatch deduplication, which follows [Trigger's task API](https://trigger.dev/docs/triggering). Worker retries cannot re-submit an uncertain vendor call. Already accepted cloud jobs can resume polling after process restart; they never restart the render.

`sandbox-billing-recovery-v1` runs every five minutes when enabled. It retries bounded receipt batches with backoff, refreshes current subscriptions/annual monthly windows, and closes only known checkout sessions retrieved from Stripe. Unknown customer/session binding without a stored ID stays blocked for operator evidence, rather than replaying after Stripe's idempotency retention window. Failed/unknown counts and held allowances are visible in account billing; [launch-health.sql](../../db/auth/launch-health.sql) provides a read-only operator summary without payloads.

Future cloud preview configuration uses explicit `REMOTION_AWS_*` credentials, region, function and bucket plus `REMOTION_ACCOUNT_SERVE_URL`. The URL must be the configured bucket/region's `/sites/account-preview-v1` bundle. Deploying that static bundle uses `npm run deploy:account-preview`; **do not run it during the current local-only work**. Its implementation excludes the repository's public media/audio, so deployment cannot accidentally upload existing generated content. The AWS function must match the installed Remotion version. Inspect S3 policies: render inputs/progress/results must remain private, with only the static bundle prefix readable as required by the renderer.

There is no anonymous browser worker callback or run-any-project endpoint. Browser reads use verified identity and current ownership; backend SDK dispatch and service-only SQL claims establish worker authority.

## Manual local acceptance

| Case | Expected behavior |
|---|---|
| New confirmed A, save setup, reload, complete twice | Saved settings; one owned draft; no provider activity |
| Enroll A, repeat, inspect B | One trusted test billing mapping; no subscription or customer unless explicit checkout later; B cannot read A |
| Catalog empty, force sales/paid env flags | No sellable offer or paid generation entitlement |
| Queue mock, close/reopen browser, restart worker | Same durable private job/result, no duplicate creation |
| Double enqueue, another key with exhausted lifetime/concurrent bound | Same job or bounded rejection; no provider side effects |
| Expire an unsent worker claim; run old and replacement workers | Replacement claim wins; stale token cannot submit/finalize |
| Cancel before submission, then try cancellation after submission | Pre-submission work canceled safely; accepted/uncertain work retains reservation |
| B guesses A's job/project/artifact or calls privileged SQL RPCs | No data, no job dispatch or signed download |
| Two real database connections compete for last units/resource slots | Exactly the allowed reservations/insertions commit; no partial rows/refill |
| Later approved Stripe sandbox checkout, duplicates and reversed deliveries | Return stays pending until authoritative sync; mapped portal remains accessible during sales shutdown |
| Later approved short script; timeout, entitlement/window change before worker start | Current guards stop submission; unknown submission retains quota and does not retry |
| Later approved cloud preview; close/restart, private-storage failure | Poll original render ID; no second render; no ready artifact until verified persistence and atomic settlement |
| Disable a specific costly feature | New/unsent provider work stops; owned content and configured billing recovery remain available |

Real Supabase sessions, UI keyboard/mobile behavior, live multi-connection contention, Stripe deliveries and private cloud export require manual evidence. Local fixtures do not prove those results. Do not label the application customer-ready from this code delivery.

## Local verification evidence

Passed on October 13, 2026:

- **362 tests:** 30 auth/security, 166 billing and 166 timeline/presentation.
- Production Next build, TypeScript and targeted auth/access/billing lint.
- **49 local production HTTP checks** with capabilities disabled; temporary server stopped afterward and synthetic probe removed.
- Secured generation/recovery worker and local mock-runner bundles, with no Next request APIs or legacy autopilot imports.
- Versioned browser preview bundle compilation, with `publicDir:null`; no public media copy, video render or cloud upload.

No real account/browser session acceptance, direct live PostgreSQL multi-connection test, Stripe delivery, provider call, AWS render or deployment was performed. No production readiness claim follows from these results.

## Recovery

Stop new sales or costly submissions with their separate flags. Keep configured signed webhook processing, portal recovery and accepted-job polling available where safe. Preserve jobs, provider IDs, original reservations, receipt history and private output bytes. No generic timeout, cancellation-after-submission or storage failure is proof of no vendor work.

The database paid-resource switch is a capability boundary, not a refund switch. Do not switch back to staging limits to bypass a depleted paid allowance. Disabling browser metadata creation at database level requires revoking the owned create/onboarding RPC grants rather than reopening legacy policies.

No paid state is seeded by these migrations. Catalog installation, resource enforcement, missing customer/session recovery and uncertain provider reconciliation require recorded operator evidence. Do not erase receipts, reset usage counters or make buckets public as recovery.
