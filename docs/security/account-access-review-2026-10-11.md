# Account creation, login, and access review

Reviewed October 11, 2026 (Asia/Manila), against the current working tree and its configured Supabase project.

**Historical baseline:** the findings below describe October 11. Local remediation through Phases 0–10 and Phase 11 acceptance preparation is tracked in [Plan 29](../../implementation_plans/29-account-access-and-vercel-launch-plan.md) and the [Phase 11 checklist](account-access-phase-11-acceptance.md). Remote containment, applied migrations and full customer acceptance remain unverified; the original findings have not been silently marked resolved.

**Verdict: the current setup is incomplete and unsafe for public customer accounts.** The app has working Supabase client foundations and isolated authorization/billing services, but it does not provide a complete signup-to-first-project flow. Anonymous access to existing database records is confirmed on the connected project. This exposure exists through Supabase even when the Next.js app runs only on your desktop.

The main requirements are in [Module 25](../../implementation_plans/25-monetization-subscription-system.md), particularly Phases 1, 2, 7, 8, 9, 10, and 11. The [billing implementation checkpoint](../billing/core-implementation.md) explicitly describes partial backend slices. The README and project plan still describe a personal, single-machine tool; the current marketing pages offer early access and guided demos.

## Findings in priority order

### 1. Critical: anonymous database access is confirmed

Read-only Supabase HEAD requests used the public anon key with no user session. Existing rows were visible in `workspaces`, `video_projects`, `scenes`, `media`, `overlay_clips`, `act_narrations`, and `channel_facts`. These are application records that need an owner boundary before customer use.

Source files explain the intended development posture:

- [fix-media-rls.sql](../../db/fix-media-rls.sql) disables RLS for media and timeline items.
- [create-overlay-clips.sql](../../db/create-overlay-clips.sql) disables overlay RLS.
- [fix-channel-facts-rls.sql](../../db/fix-channel-facts-rls.sql) disables facts RLS and documents the wider exposure.
- [fix-act-narrations-rls.sql](../../db/fix-act-narrations-rls.sql) installs an all-rows/all-operations policy.

Live anonymous writes and deletes were deliberately not attempted. Their exact permissions and all RPC grants remain to be audited; the confirmed read exposure alone blocks release.

Required: assign legitimate ownership to existing data, restore owner-scoped policies across every relevant table, restrict browser grants and privileged RPCs, and test anonymous access plus account A/account B isolation. Turning on strict RLS without repairing ownership and request code first will break existing personal workflows. Treat this as a coordinated migration with a backup, rather than blindly rerunning setup SQL.

### 2. Critical: the installed Next.js version has a Windows security advisory

The package manifest and the running development server identify Next.js **16.2.10**. `npm audit --omit=dev --json` reported 54 affected package entries: 1 critical, 37 high, and 16 moderate. These totals include dependency-chain propagation and are not 54 independently demonstrated exploits.

Vercel's [Windows remote-code-execution advisory](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) includes Next.js 16.2.10 in its affected range and applies to Windows-hosted App Router applications without Cache Components. This project runs on Windows and does not enable Cache Components. The advisory calls for an immediate upgrade. Other audit findings concern image handling, request handling, and transitive dependencies; applicability varies by enabled code path.

Required: upgrade Next.js and its matching ESLint configuration to a currently patched release, address the remaining applicable dependencies, and verify the app afterward. No exploit was attempted and no dependencies were changed in this review.

### 3. Release blocker: signup, login, recovery, and real logout are missing

Local HTTP checks returned **404** for `/login`, `/signup`, `/auth/callback`, and `/onboarding`. Source search found no implementation of `signUp`, `signIn`, `signOut`, email-verification exchange, or password recovery.

[proxy.ts](../../src/proxy.ts) simply passes requests through. The [dashboard layout](../../src/app/(dashboard)/layout.tsx) is a client shell with hardcoded identity. Its logout handler deletes `demo_auth` and navigates home; it does not terminate a Supabase session. `/billing`, `/workspaces`, and `/workspaces/new` returned **200 without cookies or a login redirect**.

Required under Module 25 Phase 2: real authentication forms and server actions, confirmation/callback and recovery handlers, safe internal return URLs, session refresh, a server-authenticated dashboard boundary, real identity, and actual Supabase signout. Authentication checks must also run near sensitive data/provider operations. See [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/creating-a-client) and [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication).

### 4. Release blocker: user and workspace ownership are not provisioned

Live schema metadata shows that `workspaces.user_id` is optional and has no default. A read-only metadata check confirms existing workspaces with null owners. An administrative HEAD check found no rows in `public.users`. This does not independently establish the number of users in `auth.users`.

The [workspace wizard](../../src/features/workspaces/components/WorkspaceForm.tsx) inserts directly from the browser and omits `user_id`. The checked-in [base schema](../../db/database_setup.sql) instead requires a non-null owner referencing `public.users` and proposes an auth signup trigger. Consequently, the source schema and connected database differ. The trigger's live presence and behavior were not verified.

Required: verified signup creates the application identity and, when needed, its personal billing account; workspace creation derives ownership from the authenticated actor; existing ownerless content is assigned deliberately; onboarding saves progress and reaches a first permitted project without duplicates. Browser-side ownership policies must independently prevent spoofed user IDs. Do not use the editable legacy `users.credits` column as subscription or spending authority.

### 5. High: sensitive API/provider paths lack consistent authorization

The [brainstorm endpoint](../../src/app/api/ai/brainstorm/route.ts) calls the configured paid text provider without checking identity, ownership, subscription, or quota. Channel-format generation likewise calls its AI agents before any verified workspace ownership check. Narration, thumbnails, and media generation have separate entry points without a universal metering boundary.

[Media upload](../../src/app/api/media/upload/route.ts), [URL import](../../src/app/api/media/from-url/route.ts), and [asset sync](../../src/app/api/sync-timeline-assets/route.ts) can reach privileged storage or local filesystem operations without a verified owner. Upload/import perform these side effects before database-record success. An empty anonymous asset-sync request returned **200**. No paid provider job, real upload, or record mutation was submitted.

Required under Phases 2 and 7: a shared verified-user/ownership boundary, validated related project/scene/media IDs, server-controlled provider choices, bounded input/file sizes, abuse controls, and metering before costly work. The AI scheduling interval in `concurrency.ts` is not per-user abuse or spending enforcement.

### 6. High: private file delivery and input boundaries need repair

The [download endpoint](../../src/app/api/render/download/route.ts) accepts a filesystem path and does not verify a user or an owned render job. A newly created harmless synthetic temp file was served with **200 to an anonymous request**. The probe file and directory were removed afterward. No existing private file was read.

Its string-prefix containment check also accepts sibling paths with the same directory prefix. Pure path computations confirmed that attacker-controlled project IDs in upload/import and relative URLs in asset sync can escape their intended directories. These path weaknesses were checked without reading or writing files outside the synthetic probe.

URL import permits any HTTP(S) destination and follows the default fetch behavior, without an approved-host/private-network/redirect boundary. This creates a server-side request-forgery risk; no internal or metadata-service request was attempted.

Required: deliver exports through an owned job/artifact ID, authorize before filesystem access, enforce resolved containment, validate identifiers, and constrain remote destinations/redirects plus response sizes and timeouts.

### 7. High: customer media is public and storage paths are inconsistent

Read-only bucket metadata confirms `project-media` and `character-references` are public; `renders` is private. Public bucket delivery bypasses download access checks for anyone with an object URL, as explained in [Supabase bucket documentation](https://supabase.com/docs/guides/storage/buckets/fundamentals). Local generated files and exports are also placed under Next.js `public/`.

[The storage helper](../../src/lib/supabase/storage.ts) uses the service-role key and produces public URLs. Upload/import target a bucket named `media`, but no bucket with that name was returned by the connected project's administrative bucket list. Those uploads are started in the background, and helper errors are returned rather than thrown, so local success does not establish durable cloud delivery.

Required under Phase 8: align bucket configuration, await and check uploads, bind objects to verified ownership, use private storage and scoped signed delivery URLs, and support authorized renderer access. Review existing public URLs before changing bucket visibility.

### 8. Incomplete: billing access and first-project entitlement are not active

The approved plan catalog is empty; all four billing activation flags are false. The connected REST schema advertises no billing tables, including no `billing_accounts` or `billing_subscriptions`. An anonymous checkout request returned **503 / BILLING_DISABLED**. The [billing page](../../src/app/(dashboard)/billing/page.tsx) displays hardcoded plan, renewal, credits, and invoices.

The offline readiness check fails Stripe secret/publishable key, key-mode matching, webhook secret, and site-origin requirements. This establishes missing/invalid configuration formats, not the validity of remote Stripe resources.

Required for the paid flow in Phases 1 and 9–11: account enrollment/backfill, approved offers and allowances, reviewed migrations, valid test configuration, real checkout/webhook/portal lifecycle verification, checkout-return synchronization, authentic billing UI, and enforced entitlement/usage on every enabled costly path. Billing recovery and owned-content access must remain available after expiry. If the intended launch is invite-only early access, a secure invitation/access process is still needed.

### 9. Incomplete: the early-access form does not create an account

The local marketing work in `src/app/api/leads/route.ts` logs the submission and returns success; it does not persist a customer record or create a Supabase user. Its form in `src/components/marketing/EarlyAccessSection.tsx` can also display success after falling back to the visitor's own localStorage. These marketing files were uncommitted when this documentation was prepared and are not included in the documentation commit. The observed behavior is not evidence of registration or a reliably received access request.

Required: durable server-side lead capture with truthful success/error handling, followed by a real approved invitation or signup path.

## What is already present and verified

- Supabase browser/server clients exist; the offline check identifies correctly placed public and service-role key formats.
- The configured Supabase Auth public settings enable email signup, require email confirmation, and disable anonymous-user login. Social providers are disabled. These settings do not prove email delivery or app integration.
- Presentation editing/export has a real `getUser()` plus project/workspace ownership check. Anonymous render-progress access was rejected with **403**. This guard is a useful existing foundation; render download and the rest of the app do not inherit it.
- **159 billing tests passed**, with no failures or skips. These include synthetic authorization, signature, SQL/RLS, usage, and recovery checks. They do not validate the live database policy layout or customer journey.
- **TypeScript passed** (`npm run typecheck`).
- **Billing readiness failed** (`npm run check:billing`) for the configuration gaps above.

## Remaining verification before calling the setup ready

1. Repair the confirmed database/file exposures and upgrade the vulnerable dependencies.
2. Verify live identity triggers, grants, ownership/RLS, storage policies, and existing-data migration in an isolated staging environment.
3. Implement and test signup, delivered confirmation email, login, refresh/expiry, recovery, logout, and resumable first-workspace onboarding.
4. Verify custom SMTP, permitted site/redirect origins, password controls, CAPTCHA, and auth rate limits. These dashboard settings were not available in the public metadata response. Supabase documents [production email delivery](https://supabase.com/docs/guides/auth/auth-smtp) and its [production checklist](https://supabase.com/docs/guides/deployment/going-into-prod).
5. Use two test accounts to prove that neither can read, edit, generate against, poll, or download the other's resources, including direct REST/RPC and storage requests.
6. For paid access, exercise the complete Stripe sandbox signup-to-generation-to-export flow, cancellation/recovery, quota enforcement, and durable hosted delivery required by Module 25.

The review changed no application source, credentials, remote data, or policies. It created this report, ran read-only metadata checks and local tests, and used a temporary loopback-only development server that was stopped afterward. No signup email, real customer account, Stripe mutation, paid generation, or production deployment was performed. This is a scoped readiness review, not a claim of complete security certification.
