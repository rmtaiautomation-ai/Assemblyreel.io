# Account Access and Vercel Launch — Phased Implementation Plan

**Plan:** 29

**Created:** October 11, 2026 (Asia/Manila)

**Status:** Phases 0–10 implemented/prepared locally within the documented supported feature scope. The user's later instruction authorized GitHub-backed Vercel account testing: existing-project auth containment is applied, and basic single-tester signup/confirmation/login/logout passed on the hosted app. Recovery and broader isolation/session acceptance are in progress; ownership/onboarding activation and customer launch remain pending. Sales are disabled and the catalog is unconfigured. See the [Phase 11 checklist](../docs/security/account-access-phase-11-acceptance.md) for the final acceptance gates.

**First user-facing milestone:** open the Vercel URL, see the landing page, log in, reach a protected account page, and log out — all delivered together in Phase 1.

## 1. Purpose and scope

This is the active implementation reference for moving AssemblyReel from its current personal-tool setup to secure customer accounts and a hosted service. Work proceeds by bounded features, with a manual test checkpoint after each phase. The user specifically requested that the Vercel landing page and login experience belong to one phase, rather than separate deployment, landing-page, and login milestones.

The immediate deliverable is this plan. Creating it does not apply migrations, deploy the app, enable purchases, or implement the phases. Future instructions to implement a phase authorize that phase's work within the session's established permissions; do not infer permission to delete existing content, invent paid offers, or run unbounded paid generation.

The plan deliberately distinguishes **successful login** from **permission to run paid generation**. An early login test must not accidentally expose the currently permissive database, storage, provider endpoints, or local files.

### Related project references

- [Account-access review](../docs/security/account-access-review-2026-10-11.md): confirmed findings and the initial live-state evidence.
- [Module 25 — subscription system](25-monetization-subscription-system.md): billing contracts, existing backend slices, and commercial decisions.
- [Billing implementation checkpoint](../docs/billing/core-implementation.md): what already exists and what remains unwired.
- [Plan 24 — Vercel storage transition](24-vercel-cloud-native-generation.md): historical hosted-generation proposal.
- Local Plan 28 (`implementation_plans/28-marketing-website-strategy-and-redesign.md`): existing landing-page direction and early-access positioning. This separate uncommitted marketing plan is not included in the account-access documentation commit.
- [Database run order](../db/README.md): existing manual SQL history and draft billing migrations.
- [Repository README](../README.md): current code organization and local workflow.

Plan 29 controls the implementation sequence for account access and hosted readiness. It brings login forward from Module 25's later customer-UI milestone without weakening that module's ownership, billing, or usage requirements. It replaces Plan 24's proposed public customer-media delivery with private, authorized delivery. Existing filenames and historical references remain stable. Document the actual new operating model as each capability is delivered, rather than describe planned features as working now.

## 2. Initial evidence and assumptions

The October 11 review established the following starting point. Recheck relevant evidence when implementing; these are observations, not permanent assumptions.

| Area | Starting state |
|---|---|
| Public entry | Landing and pricing pages exist; marketing edits are present in the working tree. Preserve unrelated work. |
| Login/signup | No complete auth feature; tested login, signup, callback, and onboarding routes returned 404. |
| Dashboard | Client layout, placeholder identity, demo-cookie logout, and no authenticated entry boundary. |
| Database | Anonymous requests can see existing application records; existing workspaces include null owners. |
| Identity | Live metadata check found no public.users records; the live signup trigger still needs inspection. |
| Storage | Project-media and character-reference buckets are public; upload code targets an absent media bucket. |
| Framework | Next.js 16.2.10 has applicable security findings; update before hosted testing. |
| Billing | Backend services exist; catalogs are empty, flags are off, and billing migrations are not active on the reviewed project. |
| Verification | 159 billing tests and TypeScript passed during the review. This does not prove live customer access. |
| Runtime | Current generation includes local filesystem writes, synchronous long work, and a localhost TTS dependency. |

Working product assumptions: email/password auth first; one personal account per user; reuse the existing marketing design and workspace wizard; social login, teams, voice cloning, and automatic social publishing are deferred. Phase 1 uses an existing, confirmed staging test account. Public registration comes in Phase 2. Prices and paid allowances remain undecided until their relevant phase.

## 3. Implementation and verification rules

1. Implement one phase at a time in small reviewable patches. Do not bundle unrelated editor, marketing, or AI redesigns into account work.
2. Record the branch/commit and working-tree changes before starting. Preserve existing work. Use the actual live schema when drafting migrations; do not blindly replay every file in db/.
3. New migrations need an explicit dependency order, preflight checks, evidence of applied state, and a recovery procedure. Preserve content, accounting history, and original ownership evidence.
4. Use a separate staging Supabase project or isolated branch and stable Vercel test origin. A Vercel Preview connected to the existing live database is not an isolated data environment.
5. Keep unfinished capabilities unavailable at the server entry point. Hiding a button, a route label, robots rules, or a client cookie cannot enforce access.
6. Ordinary operations derive user identity from verified Supabase auth. Client-supplied user, account, customer, or owner IDs cannot establish authority. Service-role access is server-only and follows explicit authorization.
7. Keep the root URL public. An authenticated session may change its navigation, but visiting / still opens the landing page.
8. API routes return structured 401/403 or feature-unavailable errors; page navigation can redirect. Stripe webhooks follow signature verification and must not inherit browser-login redirects.
9. Enable no paid feature merely because a provider key exists. Missing configuration, unknown plans, failed ownership checks, and uncertain billing state fail closed for costly work.
10. Every phase records automated checks and a practical manual checklist. Mark manual acceptance as pending until the user actually tests it; local tests are not a substitute for a Vercel browser check.

### Progress states

Use **Planned**, **In progress**, **Code verified — manual test pending**, **Accepted**, or **Blocked with a named dependency**. The blocked label here is a project tracking label, not an instruction to change any agent-goal status. Advance dependent feature activation only after its prerequisites pass. Continue independent code/documentation work when configuration is missing.

### Deployment stages

Implement one explicit server-controlled capability configuration, using the smallest set of stages/flags needed. Proposed stages are auth-only, workspace-only, service-testing, and customer-ready. These are proposed names, not existing environment variables.

| Stage | Available behavior | Remains unavailable |
|---|---|---|
| Auth-only | Landing, login/logout, protected account page; later signup/recovery | Legacy data, editor operations, uploads, provider calls, render delivery, sales |
| Workspace-only | Verified users access their own workspace/project metadata | Paid generation and cloud render submission |
| Service-testing | Explicitly enabled features for staging testers with defined limits | Public purchases and unverified provider paths |
| Customer-ready | Accepted features and approved entitlements | Deferred or unsupported features |

Gate sensitive route handlers and server actions directly. Omitted/invalid capability configuration must not enable legacy operations. Preserve a separately authorized local workflow without introducing a fake-user or hosted auth bypass.

## 4. Phase overview and progress tracker

The default implementation order is 0 through 11. Dependencies below explain which prerequisites actually matter.

| Phase | Deliverable | Depends on | Status | Manual evidence |
|---|---|---|---|---|
| 0 | Security preparation and isolated test environment | Review | Existing-project auth-only containment applied; content preserved | Auth-only containment verified |
| 1 | **Vercel landing page and real login, together** | 0 | Hosted basic login/logout accepted; expiry/Back/mobile checks pending | Partial |
| 2 | Registration, confirmation, and identity provisioning | 1 | Hosted confirmation and zero-credit profile accepted for one tester | Partial — broader email/isolation pending |
| 3 | Account recovery and auth abuse controls | 2 | Delivered recovery, old/new credentials, used-link rejection and CAPTCHA verified; native POST completion passes local HTTP checks | Partial — hosted completion/rate/expiry/session and email-change acceptance pending |
| 4 | Owned database records and workspace access | 2; 0 containment | Code/SQL prepared; actual owner mapping and isolation pending | Pending |
| 5 | Consistent API/action authorization and input boundaries | 4 | Enabled-operation guards verified locally; live checks pending | Pending |
| 6 | Private media and owned export delivery | 5 | Code/SQL implemented; existing asset migration and hosted checks pending | Pending |
| 7 | Resumable onboarding and first workspace/project | 3, 4, 5 | Code verified — manual test pending; staging migration pending | Pending |
| 8 | Durable Vercel generation and cloud rendering | 5, 6, 7 | Durable mock/script/topic-preview code verified; hosted adapter acceptance pending | Pending |
| 9 | Billing accounts and Stripe sandbox lifecycle | 2, 3, 4 | Sandbox code prepared; sales disabled/catalog unconfigured by user instruction | Pending |
| 10 | Entitlements, quotas, and real customer billing UI | 8, 9 | Supported-lane enforcement/UI code verified; approved catalog and real concurrency/provider acceptance pending | Pending |
| 11 | Complete customer journey and controlled launch | All applicable gates | Local acceptance tooling/copy/runbook prepared; actual customer acceptance and deployment pending | Pending |

## 5. Detailed phases

### Phase 0 — Security preparation and isolated testing

**Outcome:** implementation has a safe baseline, and unfinished legacy features cannot become publicly reachable during the login milestone. This is a technical preparation phase; Phase 1 remains the single landing-page-plus-login feature.

**Work packages**

1. Record the current checkout, dependency audit, route/action inventory, typecheck/build results, and existing lint failures. Upgrade Next.js and aligned tooling to a currently patched release; verify current advisories instead of choosing a stale minimum patch.
2. Prepare staging auth/data and a stable HTTPS Vercel test origin. Record local, Preview, and Production environment scopes separately. Do not copy live personal content into a public fixture.
3. Inventory exposed tables, views, functions, storage buckets, and privileged server entry points. Produce an ownership map and a record of actual grants/policies.
4. Prepare and validate immediate containment of the reviewed Supabase project's anonymous data access. Account for grants inherited through PUBLIC, permissive policies, and callable RPCs. Coordinate application compatibility before applying remote changes; use private backups and explicit owner mapping. Staging isolation alone does not repair the existing project's exposure.
5. Add a server-side auth-only capability boundary that refuses legacy dashboard data, provider work, uploads, asset sync, filesystem downloads, and render submission until their phases pass. Temporarily disabling a vulnerable operation is preferable to shipping it through the login milestone.
6. Keep provider/render/Stripe capabilities off in hosted auth testing. Remove public access to sensitive stored objects through a reviewed containment procedure, or isolate/quarantine their delivery while preserving authorized copies and references. Do not equate revoking database grants with securing public object URLs.
7. Prepare a confirmed staging tester through the approved Supabase administration workflow. Record a reference to the account, never its password or auth token in Git.

**Likely touchpoints:** package.json and lockfile, next.config.ts, src/proxy.ts, server capability helper, existing API/action entry points, reviewed new SQL, db/README.md, and a deployment setup note.

**Checks:** typecheck, production build, targeted lint, applicable dependency audit, regression checks for changed shared packages, and anonymous table/RPC/object probes in staging. Record proof of live containment separately from staging success.

**Manual acceptance:** verify the test app uses staging; attempts to open protected legacy pages or call disabled APIs reveal no data and trigger no vendor work; anonymous Supabase access no longer exposes existing content after containment is applied.

**Recovery:** revert code to a known compatible guarded build or disable the affected feature. Restore authorized access from reviewed backups without reintroducing anonymous reads or public private-content delivery.

**Exit gate:** patched framework, isolated auth test environment, reviewed containment evidence, and no reachable unguarded legacy side effects. Do not expose the login build publicly while these checks are outstanding.

### Phase 1 — Vercel landing page and login in one phase

**Outcome requested by the user:** opening the Vercel URL loads the landing page; clicking Login opens a real login form; an existing confirmed test user signs in and reaches a protected account page. This phase includes deployment configuration, login, session handling, and logout so the whole experience can be tested together.

**Scope:** preserve the current landing-page design and add the required navigation. Signup, payment, onboarding, and generation remain later features. The initial account page shows the real signed-in identity and a clear service-availability message. It reads no legacy workspace data and displays no mock plan or credits.

**Work packages**

1. Keep src/app/page.tsx at /. Add Login navigation and an authenticated Open account link without redirecting the root route to the dashboard.
2. Add /login with accessible email/password inputs, server validation, loading state, duplicate-submit prevention, useful generic failure messages, and keyboard support. Authenticate through Supabase; never use demo_auth.
3. Add a protected /account page. Verify identity on the server and render the real email or safe profile display name. An unconfirmed/anonymous/invalid user cannot enter.
4. Implement cookie-based session refresh using the installed Next.js version's Proxy convention and a Supabase helper. Preserve refreshed cookies and private cache headers when constructing responses. Never trust getSession() or a client cookie flag as server authorization.
5. Validate any return destination as a permitted internal route. During auth-only testing, /account is the default; deep links cannot reactivate legacy workspace operations.
6. Implement actual Supabase signout, clear the current browser's auth state and relevant cached private UI, and return to /. Define logout scope explicitly; do not promise that every previously issued access token is instantly revoked.
7. Protect current dashboard entry points even when visited directly. Signed-out visitors go to /login; signed-in users in the auth-only stage reach /account or a truthful unavailable state. Sensitive APIs remain independently guarded.
8. Configure Vercel Preview/test deployment with its own Supabase URL/public key and explicit site origin. Keep service-role, provider, and Stripe secrets absent where the phase does not need them. Configure the runtime/build environment and redeploy after environment changes.
9. Configure allowed auth redirect origins narrowly. Avoid accepting arbitrary request Host values as trusted callback origins or allowing unrestricted production wildcards.
10. Preserve marketing copy without implying unavailable signup or paid access. Do not present a lead form as successful delivery until its backend is durable; keep that submission unavailable or clearly staged until Phase 2 completes it.

**Likely files:** src/app/page.tsx, existing marketing Navbar, src/app/(auth)/login/page.tsx, src/app/account/page.tsx, src/features/auth/components/, src/features/auth/server/, src/server/auth/, src/lib/supabase/proxy.ts, src/proxy.ts, and the dashboard server boundary/client shell. Proposed paths do not exist yet; create only files that are needed.

**Automated checks:** production build, typecheck, auth-targeted lint, redirect validation, forged/expired session rejection, refresh-cookie propagation, protected-page/API behavior, and zero provider calls in auth-only mode. Tests should cover behavior and boundaries rather than mirror form markup.

**Manual acceptance — perform on the Vercel URL**

| ID | Action | Expected result |
|---|---|---|
| P1-01 | Open the root URL in a private browser window | Landing page loads; no automatic dashboard redirect. |
| P1-02 | Click Login | Real /login form loads. |
| P1-03 | Submit empty/invalid inputs | Useful validation; no crash or navigation loop. |
| P1-04 | Submit an incorrect password | Generic failure; no private data. |
| P1-05 | Use the confirmed staging test account | Arrive at /account and see the correct identity. |
| P1-06 | Refresh /account and navigate away/back | Session works without reverting to fake identity. |
| P1-07 | Exercise a short-lived staging session through access-token expiry | Refresh works when the refresh session is valid; an expired/revoked session is rejected. |
| P1-08 | Open /account without cookies in another private window | Redirect to /login with a safe return path. |
| P1-09 | Try an external or malformed return URL | Reject it or use the safe default. |
| P1-10 | Log out, then refresh or use browser Back | Fresh protected requests require login; no stale private shell grants access. |
| P1-11 | Open / while already signed in | Landing still loads with appropriate account navigation. |
| P1-12 | Try old dashboard/API URLs and mobile-width login | Legacy features remain unavailable; form and navigation remain usable. |

**Recovery:** roll back the auth deployment with the auth-only capability boundary intact. Retain staging identities. Missing auth configuration produces a truthful failure, never a demo login fallback.

**Exit gate:** the entire landing -> login -> protected account -> logout journey passes on Vercel. Record the test URL, deployed commit, and user-reported results. The user can stop here for the initial milestone; this does not mean the service is ready for customers.

### Phase 2 — Registration, email confirmation, and identity provisioning

**Outcome:** a new user can register, receive confirmation, and reach the protected account page with a correctly provisioned application identity.

**Work packages**

1. Add /signup, a confirmation-pending screen, resend flow with limits, and success/error states. Link signup from the landing/login pages only when this phase is accepted in the relevant environment.
2. Configure and test email delivery, templates, site URL, and permitted confirmation origins. Preserve required email confirmation.
3. Implement a PKCE/code exchange or token-verification callback matching the chosen Supabase email flow. Do not mix incompatible code and token schemes. Handle invalid, expired, reused, and wrong-origin links without unsafe redirects.
4. Inspect the real auth signup trigger and users schema. Add a migration for minimal identity provisioning with a fixed safe search path and restricted function privileges. Ensure retries/backfill do not create duplicate identities. Do not introduce a parallel profiles identity model merely because old Stripe SQL mentioned it.
5. Handle the distinction between auth identity and application profile readiness. An identity-provisioning failure must be visible/recoverable; it cannot grant legacy data access. Test signup-trigger failure and successful retry in staging.
6. Give new accounts zero implicit paid generation authority. Personal billing enrollment is introduced in Phase 9, independently of editable profile fields.
7. Replace the marketing lead endpoint's log-only capture with durable private server-side storage if the early-access form remains enabled. Preserve consent/request metadata, constrain inputs, and remove the localStorage-success fallback. A lead request is not a user account or permission to use the service.

**Likely files:** auth forms/actions and callbacks, proposed src/app/auth/callback/route.ts, signup/confirmation routes, minimal identity migration, lead route and marketing form, restricted lead-storage migration if needed.

**Automated checks:** duplicate/invalid signup behavior, confirmation and resend boundaries, safe redirect handling, profile provisioning/backfill fixtures, and no paid entitlement granted at signup. Verify Supabase behavior as well as local SQL fixtures.

**Manual acceptance:** register a new staging email; check delivered confirmation; verify an unconfirmed account cannot access protected service pages; confirm and log in; exercise resend, expired/reused links, and duplicate signup; verify exactly one application identity. Confirm a real lead submission is durably received and a failed submission is not labeled successful.

**Recovery:** disable public registration/lead submission while retaining login and existing identities. Repair provisioning idempotently; never bulk-delete auth accounts to retry a deployment.

**Exit gate:** new signup -> delivered confirmation -> real login -> provisioned account passes in the deployed staging environment.

### Phase 3 — Password recovery and auth abuse controls

**Outcome:** users recover access safely, and public auth entry points have verified abuse protection.

**Work packages**

1. Add /forgot-password and /reset-password with correct recovery-session validation, safe redirects, and invalid/expired-link handling.
2. Add the minimum account controls for password change and confirmation-based email change. Keep auth email and application contact data synchronized through a trusted mechanism, rather than browser profile edits changing identity authority.
3. Configure Supabase auth rate limits, CAPTCHA for appropriate public flows, and password controls supported by the chosen configuration. Ensure bot checks protect the underlying Supabase flow, not only a decorative form widget.
4. Add bounded request parsing and server-side abuse protection where app handlers need it. A process-local counter is insufficient across Vercel instances; prefer provider controls or an appropriate shared store.
5. Validate mutation origin/CSRF behavior for the chosen actions and auth endpoints. Redact passwords, tokens, auth links, and provider secrets from logs; keep useful safe error codes.
6. Document logout scope, disabled-account handling, and which sessions survive password changes under the configured provider behavior. MFA is a later feature unless explicitly required for a privileged operational account.

**Likely files:** recovery/account forms and actions, auth callbacks, server request/abuse helpers, auth configuration and deployment notes.

**Checks:** enumeration-safe recovery responses, forged/expired recovery token rejection, cross-origin mutation rejection where applicable, abuse limits, and secret-log review.

**Manual acceptance:** request recovery for a test account, use the delivered link, change password, verify configured old/new credential and session behavior, reuse the link, exercise a expired link, and test rejection of a failed CAPTCHA/rate-limit attempt without locking out ordinary users.

**Recovery:** temporarily disable broken recovery/change actions while login remains available. Repair provider configuration; do not weaken confirmation or expose tokens as a workaround.

**Exit gate:** recovery and account changes pass on the deployed app with real email delivery and verified abuse controls.

### Phase 4 — Owned records and database isolation

**Outcome:** every enabled application record belongs to an identified user, and the database independently enforces isolation.

**Work packages**

1. Produce a resource map covering users, workspaces, video_projects, scenes, media, timeline_items, overlay_clips, act_narrations, channel_facts, thumbnails, presentation evidence/suggestion records, and every actual additional table/view/RPC. Include object/artifact relationships.
2. Map existing ownerless workspaces to explicitly identified legitimate accounts. Resolve orphan projects/scenes, conflicting relationships, and missing identity rows. Unknown ownership stays quarantined; never assign all content to the next signup or match authority by email alone.
3. Add ordered migrations for non-null ownership where applicable, indexes, referential consistency, owner-scoped RLS, browser grants, safe functions, and restricted legacy credits writes. Keep billing authority separate.
4. Replace permissive/disabled-RLS policies with effective restrictions. Supersede historical unsafe scripts in db/README.md and prevent the documented run order from reopening access. Check policy combinations: adding a restrictive-looking policy does not remove an existing permissive one.
5. Move workspace creation into a validated server action that derives the owner from verified auth. Bound record creation for testing; do not rely on the browser's omitted or editable user_id. Preserve ordinary owned reads/edits.
6. Verify cross-resource consistency, such as a scene's media belonging to the same project, not merely a resource owned by the same user.

**Likely files:** new ownership migration/audit SQL, db/README.md, workspace actions/form, dashboard reads, presentation access guards, server auth/ownership helpers.

**Checks:** executable SQL/grant tests, fresh and representative existing-data migration tests, and live staging account A/account B direct REST/RPC checks. Test select/insert/update/delete and relationship tampering; local PGlite does not establish live Supabase compatibility.

**Manual acceptance:** two accounts see only their own fixtures; swapping workspace/project/scene IDs gives a safe rejection; anonymous requests reveal none; a legitimate owner retains old content; refresh does not change ownership.

**Recovery:** disable workspace access if a migration is incomplete. Use reviewed corrective migrations/backups to restore owned records, without disabling RLS or restoring all-rows policies.

**Exit gate:** reviewed ownership migration passes, no enabled records have unresolved ownership, and both app and direct database paths enforce isolation.

### Phase 5 — API/action authorization and input boundaries

**Outcome:** sensitive operations reject unauthorized or malformed requests before provider, storage, worker, or filesystem side effects.

**Work packages**

1. Inventory every exported server action and route, including brainstorm/script generation, channel analysis/facts, narration, scenes/timeline/overlays, media generation/poll/upload/import, thumbnails, asset sync, render status/submission/download, presentation suggestions, and worker entry points.
2. Apply shared verified-user and workspace/project/scene/media/artifact ownership guards at entry points. Keep manual owned-content reads separate from paid-generation eligibility. Check related IDs as a group.
3. Validate bounded JSON/form/stream bodies, UUIDs, durations, scene counts, prompts, model choices, file sizes/types, and updateable field allowlists on the server. Reject unsupported expensive choices.
4. Repair path containment and remove caller-controlled absolute export paths. Use trusted record IDs and derived object keys. Disable the old path endpoint until Phase 6's authorized artifact replacement is ready.
5. Constrain URL import to approved media origins with private-network/address and redirect validation, timeouts, response-size bounds, and content checks. An HTTP(S) regex alone is insufficient.
6. Unify safe JSON errors, private cache behavior, relevant origin checks, and bounded request concurrency/abuse controls. Render progress must not leak another user's job or output URL.
7. Keep every costly path disabled until Phase 10 integrates entitlement and usage enforcement. Registration or verified login alone does not authorize vendor spending.

**Likely files:** existing src/app/api routes, feature server actions, shared authorization/validation helpers, render services, and worker adapters.

**Checks:** unauthenticated and cross-account requests, malformed/mismatched identifiers, unsafe URL/path fixtures, bounded streams, and injected mocks proving zero side effects after rejection. Do not probe actual sensitive local files or cloud metadata services.

**Manual acceptance:** legitimate owned editing works for enabled metadata; direct unauthorized requests get structured errors; rejected upload/import/generation attempts create no records, objects, jobs, or provider charges.

**Recovery:** disable the affected operation while retaining safe owned reads and account recovery. Never introduce a broad service-role bypass to fix a denied request.

**Exit gate:** the operation inventory has an authorization/validation result for every enabled entry point and an explicit disabled state for the others.

### Phase 6 — Private media, uploads, and export delivery

**Outcome:** hosted media survives deployment changes and can be accessed only through an owned resource boundary.

**Work packages**

1. Adopt a documented bucket/object-key contract. Resolve the absent media bucket versus existing project-media usage without splitting new uploads across accidental bucket names.
2. Migrate customer assets/references to private delivery with reviewed compatibility for existing URLs. Keep public marketing samples separate from private project content.
3. Replace background uploads with awaited, checked persistence on hosted paths. On storage failure, return a truthful failure and retain a recoverable state. Do not report success based only on a local file write.
4. Provide owned upload/download signing or server adapters as appropriate. A signed upload grant is limited to a server-derived object key, permitted size/type, and verified project; verify the finished object before marking the media row ready.
5. Persist stable object keys/asset IDs, not expiring signed URLs as permanent source data. Refresh playback URLs when needed, and keep them out of public caches and unnecessary logs.
6. Replace /api/render/download?path=... with an owned artifact/job lookup. Verify identity and ownership before issuing a short-lived download. Provide renderer access that lasts for the job without exposing general bucket contents.
7. Remove hosted dependence on writes to public/. If local file-backed development remains supported, preserve containment and avoid serving private generated files through unguarded static paths.

**Likely files:** storage helper and policies, media upload/import/status routes, provider storage adapters, rendering asset preparation/sync, artifact schema/service, and authorized download handler.

**Checks:** two-account storage isolation, guessed object IDs, expired URLs, upload failure, response-size/type bounds, deletion/reference safety, and playback after URL refresh and redeployment.

**Manual acceptance:** upload a small staging asset; reload and redeploy; view it as its owner; reject account B and anonymous access; exercise expiry and retry; download an owned fixture export. Confirm a static/public URL cannot bypass the access boundary.

**Recovery:** disable new uploads/signing for the affected feature while retaining private copies and existing ownership records. Do not make buckets public to recover broken playback.

**Exit gate:** durable owned assets and downloads work on Vercel, including URL expiry and cross-account rejection.

### Phase 7 — Resumable onboarding and first workspace/project

**Outcome:** a confirmed account progresses through setup and reaches its own saved workspace and first draft project without paid work being triggered accidentally.

**Work packages**

1. Add onboarding routing based on server-saved state. After login/confirmation, incomplete users can resume setup; completed users can open their workspace. The root landing page remains public.
2. Reuse the workspace/channel-format components with the owned server actions. Save steps deliberately, derive completion from actual persisted requirements, and use idempotent creation to avoid duplicate workspaces/projects after refresh/back/double-click.
3. Use available channel presets and provider-independent voice selections. A Vercel page cannot call the desktop's localhost Voice Studio; offer a truthful supported preset or unavailable state until hosted voice options are accepted.
4. Let the user create a metadata-only draft project within explicit staging bounds. Creating it must not silently start script, narration, image, or render calls.
5. Replace sidebar placeholders with the verified account identity. Replace mock billing summaries with an honest unconfigured/pending state until Phase 10 provides live billing UI.
6. Provide clear empty/error/loading states, safe navigation, and retry after failed saves. Any AI-assisted onboarding option waits for the same Phase 10 cost boundary as other generation.

**Likely files:** proposed onboarding routes/feature, workspace wizard/actions, channel settings, project creation actions, authenticated dashboard shell, and metadata/state migration only where necessary.

**Checks:** resumable persisted progress, idempotent creation, invalid choices, cross-account saved state, and no provider calls from ordinary onboarding.

**Manual acceptance:** start with a new account; save part of setup; reload; finish; create one draft; leave/revisit; double-submit without duplicates; confirm account B cannot see or resume account A's setup.

**Recovery:** preserve saved settings and offer account/workspace access when onboarding is temporarily disabled. Never force recreation of existing owned workspaces.

**Exit gate:** signup/login -> resumable setup -> owned workspace -> draft project works on the deployed staging app.

### Phase 8 — Durable Vercel generation and cloud rendering

**Outcome:** an enabled generation/export operation is a durable owned job that survives browser closure, request timeout, process restart, and deployment changes. Use mocks first; production paid activation waits for Phase 10.

**Work packages**

1. Inventory which existing operations fit within the selected Vercel plan/runtime limits and which require a durable background worker. Do not treat a longer request timeout as persistence for multi-act generation.
2. Reuse the existing Trigger.dev integration only after validating deployment, imports, credentials, execution contracts, and retry behavior. Alternatively select one appropriate durable worker; avoid building competing job systems.
3. Separate request authentication/enqueue services from worker generation services. Workers cannot rely on Next.js cookies()/request-bound createClient(). Persist trusted actor/account/resource references, immutable inputs, and operation IDs; workers revalidate authorized work through explicit server dependencies.
4. Add protected durable job state with idempotency, provider IDs, retry/lease rules, safe status polling, and output ownership. Verify relationships before enqueue and again where job execution needs current authority.
5. Define cancellation, uncertainty, accepted-but-unpersisted submissions, storage failure, and recoverable retries. A generic timeout cannot authorize another vendor submission or an automatic quota refund.
6. Convert hosted narration, image/video generation, stock acquisition, thumbnails, and alignment to checked private storage. Hosted TTS uses a supported reachable provider; do not assume localhost or a user's machine is accessible from Vercel.
7. Use configured cloud rendering for hosted exports. Missing Lambda/worker configuration returns feature unavailable, never falls back to desktop Chromium/public-file rendering on Vercel. Deploy/version the Remotion bundle alongside compatible payloads.
8. Restrict worker dispatch/callbacks and polling. Do not expose a generic run-any-project endpoint or accept a client-supplied account as worker identity.

**Likely files:** src/trigger/autopilot.ts and trigger configuration, server generation services, job migration/repository/handlers, rendering services, provider/TTS adapters, and relevant UI progress handling.

**Checks:** mock durable completion; retry/duplicate enqueue; stale worker fences; restart/redeploy; browser disconnect; forged callback; cross-account polling/download; output-storage failure; and zero local persistent-file dependency on hosted paths.

**Manual acceptance:** submit a small mocked job, close/reopen the browser, and retrieve its durable result; restart/redeploy during a test job; verify another account cannot poll or download it. A real provider/render probe needs a defined staging limit and authorized spend when performed.

**Recovery:** stop new submissions and preserve job/provider IDs for reconciliation. Retain uncertain states and private outputs; do not replay every failed job blindly.

**Exit gate:** the chosen hosted execution path is verified with durable state/private output and ready to be connected to billing enforcement. Unsupported paths stay unavailable.

### Phase 9 — Personal billing accounts and Stripe sandbox lifecycle

**Outcome:** an identified account can complete the approved sandbox checkout and manage that same customer through the portal, with durable subscription synchronization.

**Work packages**

1. Resolve approved pricing, currency, intervals, allowances, sample-only preview rules, payment-failure behavior, and supported features before creating sellable offers. Existing proposal prices grant no authority.
2. Verify staging roles/schema and apply the reviewed billing drafts in their documented order. Add personal billing-account enrollment/backfill for existing/new users with unique trusted mappings; profile updates cannot change tiers or credits.
3. Configure Stripe test keys, exact allowlisted price mappings, explicit return origin, portal settings, and webhook endpoint/API-version compatibility. Keep live sales off.
4. Reuse existing checkout/portal/repository services. Handle duplicate submissions, customer-binding failures, unresolved attempts, expired/canceled checkout, and return-state verification.
5. Reuse signed, durable webhook handling. Verify real Stripe sandbox deliveries, duplicates, out-of-order events, current versus replaced subscription authority, and account lease/fencing behavior.
6. Add protected reconciliation/retry scheduling and visibility for failed/unknown states. Record health and recovery without printing raw event/customer payloads or secrets into public logs.
7. Add checkout/return/portal UI with pending, failed, canceled, and confirmed states. A success URL parameter or checkout completion alone is not proof of paid access.

**Likely files:** existing billing SQL/services/Stripe routes, account enrollment, reconciliation scheduler, catalog, checkout return components, and deployment setup notes.

**Checks:** existing billing suite, live staging grants/RPC verification, actual sandbox checkout/webhooks/portal, renewal/cancellation/failure/recovery, and duplicate/out-of-order processing. Use real multi-connection PostgreSQL tests for concurrent database assumptions.

**Manual acceptance:** account A checks out in test mode; return shows pending then verified state; account B cannot access A's customer/portal; cancellation and payment recovery synchronize without duplicating subscriptions. No real card charge is needed.

**Recovery:** disable new checkout while preserving signed webhook processing and mapped-customer recovery where configured safely. Preserve receipts, subscriptions, and accounting history.

**Exit gate:** the actual app-linked sandbox billing lifecycle passes. Generation remains unavailable until Phase 10 connects enforcement.

### Phase 10 — Entitlements, quotas, and real billing UI

**Outcome:** every enabled costly operation requires verified current access and a bounded allowance, and the UI shows the same authoritative state.

**Work packages**

1. Connect the existing shared authorization/reserve/uncertainty/settlement coordinator to every enabled script, analysis, narration, transcription, image, clip, thumbnail, suggestion, worker, and render path. Maintain an operation inventory with the feature, units, enforcement point, provider, and acceptance evidence.
2. Define finite server-calculated quantities and permitted providers/durations. Bind idempotency to account, resource, immutable inputs, and original quantities. Enforce before queueing/vendor work, and avoid double-reserving at request and worker boundaries.
3. Make quota-limited workspace/project creation atomic with resource insertion. Close direct REST/RPC paths that bypass limits; an app-only counter is not sufficient. Do not interpret deleting a project as an automatic allowance refill.
4. Verify multi-metric concurrency, last-unit contention, period boundaries, monthly allowance windows for annual subscriptions, tier changes, cancellation, uncertainty, retries, and exactly-once local settlement. Do not claim exactly-once vendor execution where the provider cannot guarantee it.
5. Exclude unapproved/free provider-backed trial paths. Public samples use approved existing content. Missing/expired/delinquent/unrecognized subscriptions stop new costly work while owned-content access and billing recovery remain available.
6. Replace mock plan, credits, renewal dates, and invoices with protected real account/usage reads and mapped Stripe invoice retrieval. Show used/reserved/remaining, pending sync, cancellation, next allowance window versus actual billing date, and safe actionable errors.
7. Add operational limits, per-account concurrent-work caps, alerts, and a server kill switch for costly features. Activate one provider/feature at a time in staging with approved bounds.

**Likely files:** server billing/generation services, protected resource-creation RPCs, worker/provider adapters, feature catalog, billing dashboard/sidebar components, and operation-coverage documentation.

**Checks:** all billing regressions, staging multi-session quota contention, direct database bypass attempts, jobs after entitlement changes, duplicate reserve/settle, and one limited generation-to-private-export flow for each enabled provider class.

**Manual acceptance:** compare two accounts with different allowed states; verify visible usage matches enforcement; consume a small test allowance, try one operation over the limit, cancel/recover payment, and confirm content/portal access remains. Test a delayed/uncertain operation without double generation or duplicate settlement.

**Recovery:** stop new costly work while retaining original reservations, jobs, usage windows, and accounting state for reconciliation. Rollback must not reset balances, regrant trials, or erase invoices/events.

**Exit gate:** no enabled costly operation bypasses the shared authority/usage boundary; live customer UI matches enforced state.

### Phase 11 — Full customer acceptance and controlled launch

**Outcome:** the advertised customer journey passes on the intended deployment with supporting recovery and monitoring evidence.

**Work packages**

1. Run the complete path: landing -> signup -> confirmation -> login -> recovery -> onboarding -> approved checkout -> verified access -> generation -> private playback/export -> billing/portal -> cancellation/recovery -> logout.
2. Repeat security checks with two distinct accounts, anonymous requests, forged identifiers/tokens, direct REST/RPC requests, guessed/expired object URLs, and disabled-account states.
3. Exercise timeout, DB/provider/storage outage, duplicate callbacks/events, request retry, browser closure, deployment restart, and uncertain work recovery. Confirm no public fallback, duplicate charge, or unexpected allowance reset.
4. Run the production build, typecheck, relevant auth/billing lint/tests, and the existing timeline/presentation release suite for changed integration surfaces. Complete manual browser/editor/media acceptance in the hosted environment.
5. Verify production configuration separately from Preview: origins, auth templates/SMTP, private bucket policies, worker/render deployment, Stripe mode/price/version mappings, approved limits, and observability. Never copy test-mode identities or subscriptions into live billing authority.
6. Update landing/pricing/FAQ copy to claim only accepted features. Document deployment, applied migrations, operation coverage, support/reconciliation procedures, rollback, and remaining deferred work.
7. Start with a limited cohort and observable spend limits. Keep unsupported features disabled. Record production smoke evidence and expand only after correct identity, access, usage, output delivery, and billing behavior are observed.

**Manual acceptance:** execute the full journey on the intended domain and record the deployed commit, account fixtures, observed results, and any failed step. Registration alone is not launch acceptance.

**Recovery:** disable registration/new purchases/new costly work as needed, preserve customer content and recovery paths, and deploy the last compatible secured version. Use the documented migration recovery path; never undo security by making data or storage public.

**Exit gate:** all required customer, security, quota, hosted-delivery, and billing tests pass; production readiness is recorded independently from staging. Only then mark the customer service ready.

## 6. Environment and configuration ownership

Do not store real secrets, credentials, signed links, or user passwords in this plan or screenshots committed to the repository. Preserve existing variable names unless a reviewed change requires migration.

| Configuration | First needed | Requirement |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY | 0–1 | Staging values for the login milestone; public key must never be a service-role key. |
| Explicit trusted site/callback origin | 1 | Per environment; use the existing NEXT_PUBLIC_SITE_URL contract where appropriate, with server validation. |
| Supabase confirmed test account | 1 | Existing authorized staging tester; credential stays outside Git. |
| SMTP/templates/redirect settings | 2–3 | Verified email delivery and narrowly approved local/staging/production origins. |
| SUPABASE_SERVICE_ROLE_KEY | Privileged phases only | Server-only; no browser bundle or unnecessary availability in auth-only deployment. |
| Private bucket configuration | 0 containment; 6 delivery | Effective object policies and a documented stable key contract. |
| Worker and provider secrets | 8/10 | Server/worker scope, actual enabled feature, bounded staging spend. |
| REMOTION_AWS_* and Lambda bundle configuration | 8/10 | Hosted render prerequisites; absent config must not select local hosted rendering. |
| Stripe test configuration and approved catalog | 9 | Valid mapped test resources; independent sales/webhook/portal/runtime flags. |
| Production Stripe/configuration | 11 | Separate live verification after all preceding applicable gates. |

Use a stable staging domain for manual auth-link testing. If Preview domains are enabled, allow only the necessary project patterns with exact production origins; do not let arbitrary preview hosts control privileged return URLs. Environment changes require the appropriate new deployment. Check current platform limits at implementation time rather than hardcode assumed Vercel allowances.

## 7. Decisions required at the relevant phase

These decisions do not block writing this plan or implementing independent code. Resolve each before performing its dependent activation or migration.

| Decision | Needed by | Default direction / unresolved detail |
|---|---|---|
| Staging Supabase and stable Vercel origin | 0–1 | Separate test data/auth; identify actual project and deployment. |
| Owner of existing personal content | 0 containment / 4 migration | Explicit legitimate owner IDs; quarantine unresolved content. |
| SMTP provider and sender domain | 2–3 | Use a production-capable configured sender; verify delivery. |
| Public versus limited registration | 2 activation / 11 launch | Staging registration first; no invented invitation system unless needed. |
| Supported hosted voices/providers/worker | 7–8 | No desktop-local dependency; validate one hosted execution path. |
| Prices, allowances, sample content, payment-failure rules | 9–10 | Preserve Module 25 proposals as proposals; approve real limits before sales. |
| Existing-content retention and accounting retention | Migration / launch | Preserve records; define deletion/retention before adding destructive lifecycle actions. |

## 8. Phase delivery record

Maintain the progress table above and append a delivery record for each phase here, or link a dedicated phase evidence note if it grows. Avoid duplicating two competing completion trackers.

Copy this template when implementation starts:

```text
Phase:
Status:
Scope delivered:
Branch/commit and deployed version:
Files and migration IDs changed:
Environment and test URL:
Applied migrations/configuration evidence (no secrets):
Automated checks and results:
Manual checklist IDs and observed results:
User manual verification: Pending / Passed / Failed, date:
Remaining issues and dependencies:
Capabilities enabled/disabled:
Recovery procedure:
Next bounded implementation task:
```

### October 12, 2026 — Phases 0–2 local delivery

See [the setup and acceptance guide](../docs/security/account-access-phases-0-2-setup.md) for configuration, SQL order, boundaries, remaining remote work, and P1/P2 manual cases.

- Local features: existing landing navigation, login, server-verified account, real logout, signup/pending/resend, token-hash confirmation, private profile provisioning, and optional durable lead capture.
- Initial security boundary: 83 legacy actions and 14 handlers disabled before existing work; dashboard/server-page and static-output guards; no environment stage reopens unfinished features. Phase 6 subsequently replaces four handlers with separately guarded private-media paths; the remaining 10 legacy handlers stay closed.
- SQL drafts: `db/auth/001-auth-only-containment.sql` then `002-account-identities-and-leads.sql`; inventory supplied. No remote migration or bucket/auth setting change performed.
- Environment: staging Supabase and stable Vercel origin await selection; no deployment, delivered-email verification, or tester creation. Auth/registration/leads remain disabled by default.
- Automated results: production build/typecheck/targeted lint passed; the continuation's 24 auth/security tests, 159 billing tests, 166 timeline/presentation tests, and 38 disabled-stage production HTTP probes passed. User manual verification remains **Pending**. A passing local check does not complete remote phase exit gates.
- Recovery: disable the affected capability flag and retain quarantine; never undo containment by restoring public data/storage access.

### October 12, 2026 — Phases 3–6 local continuation

- Scope: recovery/session proof, password/email controls, CAPTCHA integration, trusted email synchronization, owned RLS and bounded workspace creation, shared API authorization/limits, private uploads/import/playback, and owned artifact downloads.
- Migrations prepared: `003-confirmed-email-sync.sql`, `004-owned-records.sql`, `005-private-assets.sql`, `006-account-request-limits.sql`; ownership audit and operation inventory supplied.
- Existing ownerless rows/objects were preserved; no legitimate owners were invented or remotely assigned. Actual inventory, relationship repairs, legacy object migration, and hosted acceptance remain outstanding.
- All continuation features are off by default. Costly generation/render submissions/Stripe and worker entry remain closed. Only verified, separately enabled metadata/private-media paths can become available.
- Checks and remaining manual cases are recorded in [the continuation guide](../docs/security/account-access-phases-3-6-setup.md). Browser visual acceptance, SMTP/CAPTCHA, actual storage, direct two-account Supabase requests, Vercel deployment, and multi-connection limit contention remain pending.

The next deployment task is selecting/configuring staging and executing the applicable P1–P7 live acceptance cases in order.

### October 12, 2026 — Phase 7 local delivery

- Login/confirmation still return through `/account`; enabled incomplete accounts resume `/onboarding` from server-saved state. `/` remains the public landing page. `/account?overview=1` provides an explicit way to leave setup.
- New two-step setup shares existing channel presets/options, supports an owned existing workspace, and persists deliberate saves with revision checks. Completion atomically creates at most one onboarding draft per account, reusing the existing three-workspace bound and handling repeated completion safely.
- `/account/projects/[projectId]` displays owned saved metadata and verified identity. The legacy dashboard containing placeholder identity/mock balances stays inaccessible; the active account/setup/project pages display unavailable generation and billing honestly.
- No AI, Voice Studio, narration, image, render, worker or billing adapter is called. Hosted voices remain unavailable; this phase saves a manual topic only.
- Migration `007-resumable-onboarding.sql` follows 001–006. `ONBOARDING_ENABLED=false` by default; turning it off preserves state and owned account/project access.
- Local automated checks and the deployed manual checklist are recorded in [the Phase 7 guide](../docs/security/account-access-phase-7-setup.md). Remote migrations, browser visual checks and two-account staging acceptance remain pending.

### October 13, 2026 — Phases 7–10 continuation; local testing only

- User instruction: no deployment yet. Keep sales disabled and the approved catalog unconfigured. The frontend can be exercised at localhost; genuine account/metadata tests still require the configured isolated Supabase backend. No live migration or external provider/billing mutation was performed.
- Phase 7 was reverified against the combined security/billing/resource-limit migrations. Existing content and all earlier user changes were preserved.
- Phase 8 adds database-persisted jobs, atomic reserve/enqueue, immutable topic/version, worker leases/fencing, cancellation before submission, private results and retained uncertainty. Secure Trigger tasks contain no request cookies or legacy autopilot imports. A local mock-only runner supports manual queue completion without worker deployment.
- Supported paid adapter lanes: bounded short script and a versioned five-second topic title-card cloud preview. Both stay off; other provider/editor classes remain explicitly unavailable. Cloud polling resumes the original render and private output publication commits together with allowance settlement. The cloud bundle never copies the repository's public media.
- Phase 9 reuses checkout/portal/signed durable webhooks behind sandbox gates, adds personal confirmed-identity enrollment, authoritative account/usage/invoice UI and bounded reconciliation. A checkout return parameter grants no access. Unknown customer/session binding without retained identifiers still needs operator evidence.
- Phase 10 connects current entitlement and bounded allowance checks at submission, rechecks original current reservation windows before vendor work, and adds SQL triggers/receipts for atomic plan-based resource limits. No delete-based allowance refill. Paid-resource mode and its matching catalog are separately protected database configuration.
- Migration drafts 008–010 follow auth 001–007 plus the six billing foundation drafts in the exact documented order. No commercial defaults, trial credits or paid state are seeded.
- See [the local setup and acceptance guide](../docs/security/account-access-phases-8-10-setup.md) for commands, configuration, limits, remaining manual evidence and recovery. Local code delivery does not mark remote/full-customer phase exit gates Accepted.

- Verified locally: **30 auth/security tests, 166 billing tests, 166 timeline/presentation tests (362 total)**; production build/typecheck; targeted auth/access/billing lint; **49 disabled-stage production HTTP probes**; both secured worker bundles plus the local mock runner; and the versioned preview browser bundle with public assets excluded. The temporary HTTP server was stopped. No remote migration/deployment/provider execution occurred.

### October 13, 2026 — Phase 11 local acceptance preparation

- Continued with the current model and the user's localhost-only scope. No deployment, remote SQL, new account, Stripe transaction or provider execution was performed. Sales and the approved catalog remain disabled/unconfigured.
- Added `npm run verify:local`: repeatable tests, lint, build, typecheck, secured worker/preview bundles, and temporary loopback-only production HTTP probes. Child capability flags are forced off; build/runtime share an explicit local origin. Reports and per-step logs are saved to ignored `scratch/local-acceptance/`, with the base revision and working-tree scope. The runner stops its server and never reports customer launch acceptance.
- Corrected public landing/pricing/FAQ/metadata claims to distinguish planned features from enabled test access. Replaced the blocked private-export demo player with an availability notice; preserved existing page styling and conceptual workflow sections. Added a current-status pointer to the README and preserved the original review as historical evidence.
- Prepared the [Phase 11 acceptance and recovery guide](../docs/security/account-access-phase-11-acceptance.md): 15 manual cases, environment/evidence template, supported-operation coverage, monitoring triage, feature shutdown behavior, deployment prerequisites and secure rollback. All unobserved manual cases remain Pending or explicitly Deferred.
- Local verification: **362 tests passed** (30 auth/security, 166 billing, 166 timeline/presentation); production build, TypeScript, targeted auth/access/billing/marketing lint; secured worker/local mock and preview browser bundles; **51 local production HTTP probes**. Marketing lint has seven existing unused-import warnings and zero errors. Worker bundling needed normal Windows filesystem access to resolve ancestor directories; no deployment command was invoked.
- Manual customer journey, actual Supabase containment/migrations, two-account browser checks, real concurrent PostgreSQL, email, Stripe, providers, hosted configuration and production acceptance remain pending. Phase 11's launch exit gate is **not Accepted**. Current implementation changes remain in the working tree.

### October 13, 2026 — Local registration/sign-in setup continuation

- User authorized resolving the account test setup and chose to create a separate empty **AssemblyReel Test** project. No connected browser, Supabase administration tool, Docker installation or CLI is available in this session. Backend provisioning/configuration and email confirmation therefore require the user's access.
- Prepared `npm run prepare:account-test` and the [local account setup guide](../docs/security/local-account-test-setup.md). The command generates `scratch/account-test-setup.sql` from a guarded fresh core, actual auth 001–007 and installed-boundary verification, in one transaction. It refuses existing accounts/public tables/buckets/Auth triggers; no SQL was executed remotely.
- Minimal core supports guarded account identity, owned metadata onboarding and later private-media testing only. No personal content, test identities, credits, billing catalog or provider work is seeded; legacy editor activation is outside this setup.
- Changed the disabled login notice from “awaiting deployment configuration” to “awaiting configuration,” reflecting that localhost auth does not require deployment. The running local navigation endpoint still reports registration disabled. Existing backend credentials and flags were left unchanged pending the new target.
- Verified **32 auth/security tests**, including the actual fresh setup bundle, two-account ownership, repeated onboarding, existing-data refusal and full-transaction rollback; auth lint, TypeScript and local disabled-login HTTP checks passed. Earlier Phase 11 release-suite evidence remains historical; it is not a new real-account acceptance result.
- Next dependency: the user-created test project, public URL/key in `.env.local`, applied bundle and matching Supabase email/return settings. Signup/email/cookie/browser acceptance remains Pending.

### October 13, 2026 — Existing Assemblyreels backend: preserved-content login preparation

- User chose to test against existing Assemblyreels on localhost, then push verified code to GitHub after successful login/account checks. The free-slot attempt was abandoned; RMT AI COMPANY remains in use and Primecut is already paused. No unrelated project was changed.
- Read the user's exported preflight from the locally saved CSV (moved its accidental root filename into ignored `scratch/account-access-preflight.csv`). Confirmed zero Auth users/profiles, seven ownerless workspaces, 18 projects, 2,050 scenes, 527 media records, two public buckets, text scene-project keys and 778 unmatched scene references.
- Completed read-only application backups of all nine public tables and **161 Storage objects / 92,814,253 bytes** to ignored `scratch/account-backups/assemblyreels-wXHYQ5/`. Local SHA-256 checks passed; final application row re-reads matched. This is an application export, not a full platform/transactional PostgreSQL backup. No remote writes or account/provider activity occurred.
- Added `backup:account-existing`, `prepare:account-existing`, and an offline exported-schema/data replay utility. Prepared `scratch/account-existing-auth-upgrade.sql` only after validating the completed backup. The SQL guards actual columns/triggers/counts, takes bounded table locks, preserves SQL-time recovery copies, and applies auth 001–003 atomically. Storage RLS is asserted from the actual report; no unnecessary managed-table ALTER is performed. Own minimal profile reads and zero-credit provisioning replace browser access to old records/public objects.
- The initial live upgrade is deliberately **registration/login/account/logout only**. No scene type conversion, orphan deletion, owner adoption or onboarding activation. Schema-specific owned setup and personal-content mapping remain follow-up work; do not run generic 004–007 or enable their flags against this backend yet.
- Verified **36 auth/security tests**, targeted auth lint, and offline replay of the **actual exported public columns, constraints and all saved application rows** through the generated upgrade without changing content or column types. Earlier production-build/release-suite results remain historical; no fresh real-account acceptance is claimed.
- See [the existing-project login guide](../docs/security/existing-account-login-setup.md). Remote SQL application, email template/configuration, local auth activation, real signup/login isolation tests and conditional GitHub push remain pending. Existing local credentials/flags were preserved.

### October 13, 2026 — Applied containment and default-email local confirmation

- User supplied the expected existing-project SQL PASS result. Read-only live checks confirmed all nine application row hashes unchanged, anonymous reads denied, three buckets private and a denied sampled legacy public object URL. Email confirmation is required; no Auth accounts exist at this checkpoint.
- User clarified that the domain is only a planned name and no SMTP provider exists. Added default-email PKCE confirmation support using the existing SSR verifier cookie, verified confirmed identity and fixed redirect destinations. Mixed code/token requests, duplicate parameters and callbacks without the signup verifier are rejected. The optional custom-SMTP token-hash template remains supported separately.
- Verified **39 auth/security tests**, auth lint and TypeScript. Default SMTP remains limited to organization team recipients; no email was sent or real account created. URL configuration, local activation, delivered-email/browser acceptance and conditional GitHub push remain pending. No domain, SMTP service, hosting or paid authority was created.

### October 14, 2026 — Hosted login test preparation

- User reported Resend SMTP saved and the hosted Site URL/callback saved for `https://assemblyreel-io.vercel.app`. The shared Resend sender remains limited to its account email; real delivery and two-independent-account acceptance are unverified.
- Authenticated the Vercel CLI through the user's sign-in and selected existing `assemblyreel-io`, connected to `rmtaiautomation-ai/Assemblyreel.io` on main. The hosted environment is scoped to signup/login; owned content, onboarding, generation, jobs and billing stay disabled.
- Release checks passed **371 tests**, auth/access/billing/marketing lint, production build, TypeScript, private preview bundling and **51 disabled-stage HTTP probes**. The worker bundle check initially failed under a filesystem sandbox and passed separately outside it. The original runner report retains that initial failure. Production dependency audit found zero vulnerabilities; source scans found no configured private keys in the files prepared for Git.
- Vercel CLI linking unexpectedly replaced `.env.local`. Recovered a VS Code saved-history snapshot and verified its Supabase public/server keys through read-only calls. Private recovery copies remain ignored; exact recovery of every prior non-auth setting is not claimed, and those settings need review before paid capabilities are used.
- See [the hosted account login test guide](../docs/security/hosted-account-login-test.md). GitHub push/deployment evidence and actual hosted confirmation/login/logout acceptance are recorded only after observation; no full customer launch is accepted by these local checks.

### October 14, 2026 — Basic hosted signup/login milestone observed

- Pushed `5f83875363b80b004cad169415ad2df7f1343307` to main; the connected Vercel production deployment reached Ready at `https://assemblyreel-io.vercel.app`. Read-back verified 32 account-only environment settings. Hosted signup/login, anonymous redirects and invalid callback handling were checked.
- User received Resend confirmation mail and verified unconfirmed login was rejected. An earlier link failed; a fresh resend and immediate click succeeded. Read-only backend checks observed one confirmed account and one matching zero-credit profile, with all storage buckets private. Exact cause of the earlier link failure remains undetermined.
- User reports ordinary account refresh, logout, signed-out protected-page redirect and fresh password login all worked. This accepts the basic single-tester account milestone, not the full Phase 11 checklist/customer launch.
- Hosted checks found the closed legacy render endpoint returned 500 while importing render dependencies. Prepared a fix moving those imports behind the gate; all 40 auth tests, auth/render lint and production build/TypeScript passed. Automatic approval review could not refresh its authentication token, so staging/committing that correction was not executed. The correction and final acceptance documentation remain local; no unsafe workaround or admin confirmation was used.
- Remaining acceptance includes token-expiry renewal, controlled expired/reused-link and wrong-password checks, independent second-account isolation, and all ownership/onboarding/media/jobs/billing/provider phases. The Resend shared sender accepts only its account email. No paid feature has been activated.

### October 14, 2026 — Recovery continuation prepared

- Corrected Supabase `pkce_` token-hash compatibility for signup, recovery and email-change callbacks. Recovery proof creation requires matching verified subject/session claims; unsuccessful verification of a newly created recovery session signs that session out locally.
- Added a separate `AUTH_EMAIL_CHANGE_ENABLED=false` gate so password recovery can be tested with the shared Resend sender before two-inbox email change is available. The Turnstile widget uses flexible width; actual mobile/browser acceptance is still pending.
- Added a rollback-only existing-project A/B role isolation SQL check and executed it locally against the existing-schema fixture. It leaves no synthetic accounts behind, sends no email and does not claim two real browser-session acceptance.
- Verified **46 auth tests**, auth/access/render lint and production build/TypeScript. Live probes confirmed wrong-password rejection without a session, one matching zero-credit profile, unchanged eight legacy content hashes, private buckets and closed recovery/email-change callbacks.
- The earlier automatic-review authentication problem no longer blocked staging on this continuation. Publishing evidence is recorded after deployment. CAPTCHA/provider configuration, live isolation SQL and browser recovery/expiry/mobile checks are the next dependencies; see [the concrete recovery setup](../docs/security/hosted-account-recovery-setup.md).

- Pushed `b4a41021963cfc1510dcb91a8b9e583f299ea6ef`; deployment `dpl_2LTsWnEMV613cZi9yKK9Kf4eoG82` reached Ready and serves the stable Vercel origin. All ten follow-up HTTP probes passed, including GET/POST render returning 503. No enabled browser surface was available for visual/mobile automation.
- Added an additional real Supabase SSR SDK test using synthetic expired cookies and a stubbed provider transport: renewal updates both incoming/outgoing cookies, and failed renewal clears the cookie and redirects to login. All **47 auth tests** and auth lint pass. This is SDK/application evidence, not a real hosted token-expiry observation.
- User created the Turnstile widget and supplied its public Site Key. Prepared matching Vercel CAPTCHA configuration and a private recovery proof secret, with recovery/email-change still disabled. Signup/login/resend now show actionable missing/invalid-challenge and rate-limit errors. Focused flow tests, auth lint and production build/TypeScript pass. Supabase secret configuration and live positive/negative CAPTCHA checks remain pending.
- The corrected `b2d9563` redeployment reached Ready; exact environment read-back and the public client bundle were verified after removing CLI-added trailing newlines. The user reports recovery redirect/template and Supabase CAPTCHA saved. Both missing/invalid-challenge provider probes now return `captcha_failed` without sessions. Valid-challenge login, provider rate-limit settings and real password recovery remain pending. Changed the widget to compact sizing for narrow auth cards; auth lint and production build/TypeScript pass.
- User verified valid CAPTCHA login; reviewed dashboard limits of 30 emails/hour/project, 30 signup/sign-in and verification requests/five minutes/IP, and 150 refresh requests/five minutes/IP. Enabled recovery for controlled single-tester acceptance after exact environment read-back; the `3c6a8d3` production redeployment reached Ready at the configured origin. Eight HTTP probes passed, including private/enabled recovery and closed content/billing. Actual delivered recovery, password/rate/session results and live rollback-only isolation SQL remain pending; no complete phase/customer launch is claimed.
- User subsequently ran the complete rollback-only auth isolation SQL and reported its expected PASS result. Read-only follow-up confirmed exactly one real confirmed account and one matching zero-credit profile, no retained test identities, unchanged eight legacy content table hashes and three private buckets. Live auth-only A/B role isolation is accepted; independent browser-account and owned-content acceptance remain pending.
- User tested delivered recovery and verified, after logout, that the old password fails and the new password works. The completion navigation reached account instead of login; prepared full document navigation only after confirmed global sign-out, plus a login success notice. Real SSR fixtures cover base/chunked cookie clearing and proof consumption; sign-out errors do not claim completion. Browser retest, actual recovery 429, reused/expired-link and other-session checks remain pending. Original navigation cause is not proven.

## 9. Technical references

These primary sources were checked while preparing the plan. Recheck time-sensitive details during implementation.

- [Supabase SSR clients and session refresh](https://supabase.com/docs/guides/auth/server-side/creating-a-client): Phase 1 cookie-based sessions, verified identity, and cache handling.
- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication): server boundaries and authorization near sensitive operations.
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls): Phase 1–3 allowed origins and confirmation/recovery destinations.
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp): Phase 2–3 real email delivery.
- [Vercel environment variables](https://vercel.com/docs/environment-variables): environment-specific configuration for Phase 1 and launch.
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations): Phase 8 runtime and worker choices.
- [Vercel Windows security advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36): Phase 0 framework remediation; also recheck later advisories.
