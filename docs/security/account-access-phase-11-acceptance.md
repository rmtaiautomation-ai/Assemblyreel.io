# Phase 11 — Local acceptance and launch preparation

Date: October 13, 2026 (Asia/Manila). Active reference: [Plan 29](../../implementation_plans/29-account-access-and-vercel-launch-plan.md).

**Status: local acceptance preparation implemented; hosted signup/login test selected; manual customer acceptance and launch pending.** The user initially requested localhost testing and then selected GitHub-backed Vercel testing. Sales remain disabled and the approved catalog remains empty. Follow the [hosted login test guide](hosted-account-login-test.md) for the current target.

**Earlier account test target (superseded):** preparation for an empty **AssemblyReel Test** Supabase project is retained in the [local account setup guide](local-account-test-setup.md). The user subsequently selected the existing backend because no free project slot was available.

**Latest target decision:** no free slot is available, and the user authorized using existing Assemblyreels on localhost. Its exported schema and application row/object backups were reviewed; follow [the existing-project login guide](existing-account-login-setup.md). Only login/registration prerequisites are prepared for initial activation. Legacy ownership/onboarding requires a schema-specific continuation; real customer acceptance is still pending.

**Applied database checkpoint — October 13, 2026:** the user supplied the expected existing-project SQL PASS result. Read-only live checks confirmed unchanged SHA-256 hashes for all nine application table exports, denied anonymous REST reads, all three buckets private and a denied sampled legacy public object URL. No Auth accounts exist yet. Email signup is enabled with confirmation required; callback/template configuration and real email/browser acceptance remain pending. No local auth activation or GitHub push occurred at this checkpoint.

**Latest testing direction:** the user now wants GitHub-backed Vercel hosting and Resend email delivery for a real hosted signup/login test. This supersedes the earlier localhost-only direction; provider setup, hosted origin/configuration, push/deployment and actual hosted acceptance remain pending. Default-email PKCE support is also available for local team-address testing. No full-customer or paid-feature launch is accepted by this change in testing target.

## Delivered locally

- `npm run verify:local` runs the auth/security, billing and timeline/presentation release suites, targeted lint, production build, TypeScript, secured worker bundles, isolated preview bundle, and production HTTP probes.
- The runner overrides all boolean capability flags from `config/auth.env.example` to false in its child processes. It leaves `.env.local` unchanged, binds its temporary server to `127.0.0.1`, and stops that server after probing. It never calls migration, deployment, account creation or provider commands. Dependencies must already be installed. A production build may need network access for configured build assets such as fonts.
- Each run writes individual logs and `report.json` to ignored `scratch/local-acceptance/<UTC timestamp>/`. The report records the base Git revision and identifies the tested working tree; it does not claim the changes were committed. A failed or skipped required step produces a nonzero exit code. Read failed-step logs before retrying. Logs are local evidence, not automatically published artifacts; review them before sharing.
- Landing, pricing, metadata and FAQ copy identify current test access and planned production features. The landing page no longer attempts to play a private legacy export. No generated customer file was moved into public storage.
- This checklist records the remaining manual gates, supported feature coverage, monitoring and recovery responsibilities.

Run the complete local check from the repository:

```powershell
npm run verify:local
```

For ordinary manual page testing:

```powershell
npm run dev
```

Open `http://localhost:3000`. With the default flags off, the expected result is the landing page and truthful unavailable states. A passing disabled-feature smoke test is evidence of containment, not evidence that a real user can sign up or generate a video.

## Prepare real local account acceptance

Use the [Phases 0–2 guide](account-access-phases-0-2-setup.md), [Phases 3–6 guide](account-access-phases-3-6-setup.md), [Phase 7 guide](account-access-phase-7-setup.md), and [Phases 8–10 guide](account-access-phases-8-10-setup.md) for configuration and the exact SQL order. Do not infer applied migrations from a readiness environment flag.

The frontend stays on localhost using the reviewed existing Assemblyreels backend. Docker/Supabase CLI and an isolated backend were not installed. The existing-project auth 001–003 bundle has now been applied and containment checked as recorded above; local activation flags remain off until callback/template configuration is observed. Ownership and later generic migration drafts must not be applied directly to this legacy schema.

Prepare two confirmed test accounts, A and B, and a signed-out browser profile. Keep passwords, tokens, signed links, service keys and personal content outside the repository. Record only fixture aliases and redacted evidence references. Review configured email templates, allowed localhost return URLs and CAPTCHA settings before real signup/recovery testing. Restart the dev server after configuration changes.

## Manual acceptance record

Every row starts **Pending**. Change a row to Passed only after observing it in the named environment; record failures with reproduction steps. A local result does not automatically count for hosted staging or production. Rows needing approved billing/provider configuration remain deferred under the current instruction.

| ID | Action and expected evidence | Current result |
|---|---|---|
| L11-01 | Open `/` and `/pricing` signed out on desktop and narrow mobile width. Landing stays public; Login works; no broken private video, purchasable plan or claim of available full video generation. Keyboard focus and text remain usable. | Pending |
| L11-02 | Register A; confirm actual email delivery; try unconfirmed login, expired/reused confirmation and malformed return URLs. Only confirmed A reaches the protected account; one application profile exists. | Partial — hosted tester reports delivery, rejected unconfirmed login and successful fresh-link account access on October 14, 2026. Backend confirms one confirmed identity and matching zero-credit profile. Earlier link failed; fresh resend succeeded. Controlled expired/reused-link checks remain pending. |
| L11-03 | Sign in, refresh through token expiry, visit `/`, log out, use Back and request protected pages again. Fresh protected requests require valid identity; no redirect loop or private cache leak. | Partial — hosted tester reports ordinary account refresh, logout, fresh protected-page redirect and password login all passed on October 14, 2026. Token-expiry renewal, landing navigation and Back/cache checks remain pending. |
| L11-04 | Request password recovery with valid/invalid email and CAPTCHA. Test expired, reused and unrelated recovery sessions; change password and confirm refresh-session revocation. Test confirmed email change and profile synchronization. No link or token appears in shared logs. | Partial — user reports recovery email configuration and CAPTCHA saved. Direct provider checks reject missing/invalid challenges with no session; valid-challenge login and delivered recovery/password/session acceptance remain pending. Email change stays disabled until two-inbox delivery is available. |
| L11-05 | Save onboarding, close/reopen browser, retry completion and resume. Exactly one owned first draft is created; workspace settings survive; incomplete setup has an account escape path. | Pending |
| L11-06 | With B and anonymously, request A's workspace, project, job, upload, media link and artifact through pages, APIs and direct database REST. Foreign data stays inaccessible. Browser calls to service-only RPCs and config writes are denied. Repeat with forged/expired tokens and a disabled test account. | Pending |
| L11-07 | Upload supported private fixture bytes as A; reject unsupported, oversized and mismatched types. Download as A, deny B; check guessed object URLs, signed-link expiry, legacy public paths and image-optimizer paths. Confirm actual bucket policies. | Pending |
| L11-08 | Queue a mock job, retry the same operation, close/reopen the page, then run `npm run run:local-mock -- <job-uuid>`. One durable result survives restart; zero provider calls. Cancel before submission and confirm the lifetime mock allowance does not refill. | Pending |
| L11-09 | On separate real PostgreSQL connections, contend for the final resource/job/allowance slot. One allowed mutation commits; others are rejected with no partial ledger/job records. Repeated onboarding and content deletion do not refill allowance. | Pending |
| L11-10 | Enroll A in sandbox billing twice; observe one mapping and no implicit subscription/credit. B cannot read it. Empty catalog prevents offers and purchases even if sales flags are mistakenly requested. | Pending |
| L11-11 | After explicit catalog approval, complete a Stripe test checkout. Return URL stays pending until verified synchronization. Duplicate/reversed events, failed payment, cancellation and renewal preserve correct access and original allowance windows. Portal recovery works during sales shutdown. | Deferred — catalog unconfigured |
| L11-12 | After provider approval, run one bounded script and one five-second topic preview. Verify immutable inputs, private output, actual provider identifiers and allowance settlement. This does not accept narration, full video or legacy editor exports. | Deferred — paid features disabled |
| L11-13 | In an isolated backend/provider test, interrupt before submission, after submission, after provider acceptance, and during private persistence. Unsent work may cancel; uncertain work retains quota. Restart resumes the stored render ID without submitting again. Duplicate finalization publishes/settles once. | Pending — fixtures pass; actual service evidence needed |
| L11-14 | Disable each relevant capability while requests/queued work exist. New work stops at its documented boundary. Inspect preserved outputs, IDs, receipts and reservations; configured recovery remains available where safe. | Pending |
| L11-15 | Exercise form errors, loading/duplicate submissions, keyboard navigation, mobile layout and private media playback/download in a real browser. Record browser/version and viewport. | Pending |

For each completed case, append:

```text
Case ID / date / tester:
Environment and origin:
Working-tree revision or committed/deployed version:
Backend alias and applied migration evidence:
Fixture aliases (A/B/anonymous):
Observed result and redacted evidence reference:
Passed / Failed / Deferred:
Follow-up issue and owner:
```

Remote containment and basic single-tester email/session checks are recorded above. Token-expiry renewal, Back/cache checks, recovery, independent browser-account isolation, real multi-connection contention, Stripe delivery and generation-provider acceptance remain pending.

## Operation coverage at this checkpoint

| Capability | Prepared code | Activation/acceptance |
|---|---|---|
| Landing/login/confirmed registration | Implemented with server guards | Basic single-tester hosted milestone passed; remaining cases above |
| Recovery and email change | Implemented with separate email-change gate | CAPTCHA/recovery setup and real recovery acceptance pending; new-address email delivery unavailable |
| Owned setup and private media | Implemented with SQL drafts | Applied migration, ownership and storage evidence pending |
| Durable mock job | Implemented, including local worker command | Configured isolated backend manual run pending |
| Short script and five-second topic title card | Bounded adapters and reservations prepared | Off; approved catalog, bounds and provider tests pending |
| Billing and quota UI | Sandbox implementation prepared | Sales off; empty approved catalog |
| Narration, image/clip generation, full video exports, legacy editor, autopilot | Closed | Separate implementation and acceptance required |

## Monitoring and incident handling

No hosted alerting integration is configured. Before any cohort launch, assign an operator and escalation channel and rehearse the following checks in the chosen environment. Use [launch-health.sql](../../db/auth/launch-health.sql) for aggregate job, webhook, checkout, usage and resource-mode evidence; it is read-only and must be run by a trusted operator after the complete migration bundle.

| Signal | Initial operator response |
|---|---|
| Any cross-account/private-object exposure | Stop affected access immediately; if necessary set `AUTH_LAUNCH_READY=false`. Revoke actual exposed grants/object access, preserve evidence, investigate impacted data, and rerun isolation checks. App flags alone cannot repair direct database/storage exposure. |
| Queued jobs or expired claims growing across dispatcher cycles | Check dispatcher/worker configuration and logs. Pause new jobs with `DURABLE_JOBS_ENABLED=false` if necessary; remember that this also stops the guarded worker/dispatcher. Preserve the queue and restore only after diagnosis. |
| Unknown job without provider handle | Stop new costly submission with `COSTLY_FEATURES_ENABLED=false`; correlate job ID and trusted provider evidence privately. Do not blindly requeue, refund, reset usage or issue another provider request. |
| Accepted cloud job with delayed persistence | Retain its handle and reservation. Keep the configured polling/recovery path active when safe; repair private storage and resume polling the same render. Never expose a public fallback URL. |
| Failed/exhausted webhook receipts or unsynchronized checkout | Inspect signature/version/mode/mapping configuration and recovery logs. Set `BILLING_SALES_ENABLED=false` to stop new checkout while retaining configured webhook/reconciliation/portal recovery. Unknown sessions without identifiers need operator evidence. |
| Quota mismatch or unexpected spend | Stop new costly work and sales; preserve ledger history and provider records. Do not clear reservations because a timeout occurred. Investigate before reenabling. |
| Auth/email failure | Disable registration/recovery as appropriate, preserve existing identities, verify templates/allowed origins/provider settings, and retest with the same fixture aliases. |

Use counts and opaque job/event IDs for diagnosis. Do not log email links, credentials, complete event bodies, scripts or signed media URLs into public reports. Record which switch was changed, when, and which work remained in flight. Feature flags stop new work at their guards; they cannot retract a provider request already accepted.

## Future deployment and rollback gate

Deployment is deferred by user instruction. Before a future deployment, record the exact committed version, isolated target and origin, migration owner/backup and applied order, owner mapping, auth/email configuration, private buckets, worker/render version, supported lanes, catalog/mode, operator and spend limits. Verify staging and production independently; never copy test subscriptions into live authority. The current billing implementation intentionally supports the guarded test-mode launch only; live sales need separate implementation/review.

Start a limited cohort only after all applicable manual gates pass and the owner explicitly decides the supported offer and limits. Do not mark deferred core video features as accepted merely because a topic preview renders.

For a regression, disable the affected capability and return to the last compatible **secured** build. Preserve identity/content/ledger/job state. SQL migrations are not automatically reversible: use the reviewed backup and a forward repair compatible with the guarded app; do not replay legacy setup, revoke security boundaries or make private buckets public. Re-run local checks, backend isolation, and the failing manual case before restoring access. Record rollback evidence and unresolved cases here.

## Automated evidence

The final run result and counts are recorded in Plan 29's Phase 11 delivery entry. Detailed generated logs remain in `scratch/local-acceptance/`; they are intentionally ignored by Git. **Local success never sets `launchAccepted` to true.** The customer launch remains pending until the manual and environment gates above have observed evidence.
