# Account access: Phases 0–2 setup and acceptance

**Date:** October 12, 2026 (Asia/Manila)

**Plan:** [29 — account access and Vercel launch](../../implementation_plans/29-account-access-and-vercel-launch-plan.md)
**Status:** implementation prepared locally; remote setup and user acceptance pending.

The landing page, login, protected account, logout, signup, confirmation, and resend code are implemented. This is **not a deployed or accepted customer launch**. The staging Supabase project and stable Vercel domain have not been selected. No remote migrations, bucket changes, auth settings, accounts, emails, or Vercel deployment were performed. The subsequent [Phases 3–6 continuation](account-access-phases-3-6-setup.md) is now prepared locally and is the current reference for recovery, owned metadata, and private media.

## 1. What is delivered

| Phase | Local delivery | Remaining acceptance |
|---|---|---|
| 0 | Next.js and aligned ESLint config 16.4.0; compatible dependency security fixes; fail-closed legacy entry points; SQL inventory and quarantine migration; permission/provisioning tests | Select isolated staging; inspect actual schema/grants/triggers; private backup; apply/verify containment in staging and separately in the reviewed existing project |
| 1 | `/` remains the existing landing; desktop/mobile Login or Open account; `/login`; server-verified `/account`; cookie refresh; safe return paths; real local-scope logout; legacy-page redirects | Staging confirmed tester, trusted origin, Preview environment, Vercel deployment and P1 manual checklist |
| 2 | `/signup`; `/signup/confirm`; resend; token-hash callback; minimal `public.users` provisioning/backfill; zero new legacy credits; optional private durable leads | Inspect/apply migration; required email confirmation; SMTP/template/redirect settings; delivered-email and duplicate/expired-link tests; activate registration/lead flags only after acceptance |

An account page reads only the verified user's `users.id,email`. Missing application identity is shown as a setup problem. It does not read old workspaces, imply a subscription, or authorize generation.

## 2. Current capability boundary

- 83 exported legacy server actions stop before existing work, including standalone narration/script actions under `src/lib/ai`.
- Initially 14 legacy API handlers were closed; Phase 6 replaces four with separately guarded upload/import/status/artifact handlers. The remaining 10 legacy handlers stay closed. All activation flags are off by default; no provider work or billing lifecycle is active. See the continuation's exact request contracts and operation inventory.
- The dashboard layout and server pages independently redirect to login/account before legacy queries. Existing client pages cannot mount through the guarded layout. The prior dashboard shell is retained in `LegacyDashboardShell.tsx` for later work and is not rendered.
- Storage helper calls are blocked. `/media/*` and generated `/audio/*` are unavailable even with filename extensions; bundled `/audio/transitions/*` remain static assets. The image optimizer accepts only the marketing logo and cannot be used to fetch legacy output.
- Login is unavailable unless `AUTH_LAUNCH_READY=true` **and** `APP_ACCESS_STAGE=auth_only`. Missing or unsupported stages fail closed. **No configuration value reopens legacy features.** Future phases must add their actual ownership and entitlement checks.
- Registration and leads have separate server flags, off by default. The marketing form reports errors honestly; failed requests are not called successful or written to a localStorage fallback.

This also disables the old personal-tool features locally. The code is preserved; enabling the hosted service belongs to later accepted phases. Previously deployed Trigger.dev workers, old app deployments, direct Supabase grants, and public bucket URLs are external surfaces: this local code cannot retroactively secure them. Inventory and disable/quarantine those independently before public testing.

## 3. Select and inspect the targets first

Use an isolated Supabase staging project and a stable Vercel Preview alias. Record their non-secret project references, origins, and the deployment commit here after selection. Keep Local, Preview, and Production variables separate. Do not copy the existing personal content into a public test fixture.

Before changing the reviewed existing project:

1. Take and verify a **private** database and object backup. Preserve the existing URL/key mapping privately for recovery.
2. Run [inventory.sql](../../db/auth/inventory.sql) in the intended project's SQL editor. Inspect every exposed schema, table, view, function/RPC, policy, column grant, default privilege, role membership, creator role, bucket, and auth trigger. Verify that Data API exposed schemas match the inventory; the supplied migration targets `public` and `storage`.
3. Confirm the actual `public.users` columns, email uniqueness, credits default, and `auth.users` triggers. The draft reuses `handle_new_user` / `on_auth_user_created`; any differently named existing signup triggers need explicit review rather than blind replay.
4. Record legitimate owner IDs privately. The reviewed `workspaces.user_id` can be null. Do not guess an owner from the first signup. Quarantine unresolved rows; the migrations do not assign or delete them.
5. Inventory separately running deployments/workers and any public media URLs still used by other software. Coordinate their loss of access before quarantine.

Ownership relationship to preserve for Phase 4: `auth.users.id → public.users.id → workspaces.user_id → video_projects.workspace_id → scenes/media/timeline/overlay/narration project relationships`. Confirm each child's actual foreign key and project relationship in the target schema; channel facts belong to their workspace. No owner backfill is implemented in Phases 0–2.

## 4. Apply and verify the SQL in staging

Run these files in order, using the intended project's administration/SQL workflow:

1. [001-auth-only-containment.sql](../../db/auth/001-auth-only-containment.sql)
2. [002-account-identities-and-leads.sql](../../db/auth/002-account-identities-and-leads.sql)

**001 quarantines the entire project's browser access.** It revokes PUBLIC/anon/authenticated schema, table, column, sequence, and public function grants; enables public-table RLS; makes all project buckets private; and adds a restrictive storage policy that overrides old permissive policies. Existing rows and objects remain. It intentionally removes existing personal-tool access. Review other exposed schemas/roles and creator-role default privileges separately. Do not replay old RLS-disabling setup files afterward.

**002 reopens only authenticated own-row `users.id,email` reads.** It fixes the signup trigger's search path and execute privileges, creates zero-credit identities for email users, skips anonymous auth identities, and backfills by auth ID without overwriting existing credits. A conflicting email aborts for review. Existing balances are preserved and grant no paid authority. There is no profile-update grant or parallel `profiles` model.

The optional lead table has no browser read/write grants. Only the server service role can call its insertion function. That function stores request and consent metadata with server timestamps and serializes same-email submissions to enforce a 60-second interval. The route validates bounded inputs, same origin, and an 8 KiB streaming body limit. Public bot/global abuse controls remain Phase 3 work; leave leads off until the intended public exposure is accepted.

After applying, verify with two synthetic confirmed accounts and an anonymous client:

- Anonymous and authenticated legacy table/view/RPC access fails even if old permissive policies remain.
- Account A can select only A's `users.id,email`, and cannot read B or credits, update credits, or create profile rows directly.
- New auth accounts have exactly one matching application identity; a trigger failure is visible and can be repaired without deleting unrelated accounts.
- Unconfirmed and anonymous auth identities cannot enter `/account`.
- Anonymous public-object URLs fail; restrictive storage policies reject object reads/writes. Existing signed URLs need expiry/revocation review independently.
- Old external app deployments/workers cannot continue unguarded provider work.

Record live containment of the previously reviewed project separately. Securing staging does not repair its public access. Remote verification has not happened yet.

## 5. Configure Local and Vercel Preview

See [config/auth.env.example](../../config/auth.env.example). Copy the intended values into `.env.local` for local testing or Vercel's **Preview** environment:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-STAGING-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-STAGING-PUBLIC-KEY
NEXT_PUBLIC_SITE_URL=https://YOUR-STABLE-STAGING-DOMAIN
APP_ACCESS_STAGE=auth_only
AUTH_LAUNCH_READY=false
AUTH_REGISTRATION_ENABLED=false
MARKETING_LEADS_ENABLED=false
```

Use `http://localhost:3000` as the explicit origin locally. Hosted origins must use HTTPS and contain no credentials, path, query, or fragment. A request Host header never chooses the confirmation destination. The public Supabase key must be an anon JWT or publishable key, never a service-role/secret key.

Keep provider, Stripe, and service-role secrets absent from the login deployment. A service-role key is needed **only if optional leads are enabled**, in server-only environment scope. Login, signup, profile reads, and confirmation use the public key plus the verified user session.

Once Phase 0 staging containment is actually verified, set `AUTH_LAUNCH_READY=true`. Create/reference a confirmed staging tester through the approved Supabase admin workflow; do not record the password/token in Git. Run:

```powershell
npm run check:auth
npm run test:auth
npm run lint:auth
npm run typecheck
npm run build
```

`check:auth` checks local configuration only. Its operator flag is not proof of applied remote security. The current workspace correctly reports pending trusted origin, stage, and remote acceptance. Do not set the flag merely to silence those results.

Deploy with the Next.js framework preset and project root, using the current lockfile. Redeploy after environment changes. Confirm Preview uses the intended Supabase project before entering credentials. Keep Production flags off until its own acceptance. Phase 1's Vercel deployment has not been performed.

## 6. Phase 2 email configuration

`/auth/callback` supports either a token hash with `type=email` or a default-template PKCE code. Each request must use exactly one flow: mixed/duplicate parameters, malformed values and wrong-origin requests are rejected. PKCE requires the signup browser's verifier cookie and an additional Auth `getUser` identity check. Both flows require a confirmed, non-anonymous identity. Redirect destinations are fixed to account or confirmation-error pages and never echo credentials.

In Supabase Auth:

1. Keep email confirmation required; anonymous sign-in disabled. Disable public signup until the staging migration and email configuration are ready.
2. Set Site URL to the stable staging origin and narrowly allow the necessary local/staging callback URLs. Do not use arbitrary production/Preview wildcard origins.
3. Configure the sender and SMTP provider. Test actual delivered mail, including spam placement and delivery failures. No SMTP credentials were configured in this session.
4. In the **Confirm signup** email template, use the documented redirect supplied by the app:

```html
<h2>Confirm your AssemblyReel account</h2>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">Confirm email</a></p>
```

The application supplies `${NEXT_PUBLIC_SITE_URL}/auth/callback` as `emailRedirectTo` for signup and resend. Match the template and allowlist exactly. The default ConfirmationURL template is also supported through PKCE; open its link in the signup browser/profile. For localhost tests without custom SMTP, keep that default template and use a Supabase organization team member's email. Default mail recipient/rate limits still apply. The dashboard requires custom SMTP to edit the alternative token-hash template above.

5. Set appropriate Supabase Auth email/signup/resend rate limits (at least a 60-second resend interval), and verify observed `429` behavior. The UI has pending-submit protection; durable provider limits are the server enforcement. CAPTCHA and broader login/recovery abuse controls belong to Phase 3.
6. Enable `AUTH_REGISTRATION_ENABLED=true` only when configuration and delivered-email tests pass, then redeploy. Enable `MARKETING_LEADS_ENABLED=true` only after its storage and failure checks pass; configure the server-only service-role key if using it.

Signup and resend responses do not disclose whether an email already exists. Unexpected auto-confirm sessions are signed out and reported as a configuration error. Logout uses Supabase **local** scope: it removes this browser's refresh session and uses full document navigation to discard the Next.js private route cache. Other devices remain signed in; previously issued access tokens are not promised immediate revocation.

## 7. Manual acceptance record

Use Plan 29's **P1-01 through P1-12** on Vercel: root landing, Login, invalid inputs, wrong password, correct identity, refresh, expiry/refresh, anonymous account visit, forged returns, logout/back, signed-in root navigation, mobile and legacy endpoints.

Then test Phase 2:

| ID | Action | Expected |
|---|---|---|
| P2-01 | Register a new synthetic staging email | Pending-confirmation screen; no paid access |
| P2-02 | Try logging in before confirmation | Generic failure; no account page |
| P2-03 | Open delivered confirmation on the configured origin | Verified account email; one application identity |
| P2-04 | Repeat signup for an existing email | Same generic pending behavior; no duplicate identity |
| P2-05 | Resend repeatedly | Provider rate limit, no unbounded email sends |
| P2-06 | Reuse/expire/tamper with the link or change its type/origin | Safe invalid-link screen; no token leak or external redirect |
| P2-07 | Exercise provisioning failure using an isolated fixture | Failure visible; repair/retry leaves one identity |
| P2-08 | Submit a lead with consent, then simulate DB/network failure | Durable private row on success; failure shows error, never localStorage success |
| P2-09 | Visit old APIs/pages as both signed-out and signed-in users | No legacy content, file access, provider submissions, or billing |

**Environment/project:** Pending.

**Stable URL / deployment commit:** Pending.

**Applied migration evidence:** Pending.

**SMTP and delivered-email evidence:** Pending.
**User manual acceptance:** Pending for all P1/P2 cases.

## 8. Local verification and recovery

The actual SQL is tested with PGlite fixtures containing inherited PUBLIC grants, column grants, permissive storage policies, legacy views/RPCs, two users, anonymous identities, conflicting provisioning, and preserved existing credits/content. These fixtures do not establish Supabase hosted behavior or concurrent multi-connection guarantees.

New auth tests exercise server validation, duplicate/auto-confirm signup, wrong/expired confirmation, resend limits, real local-scope logout behavior through mocked SDK boundaries, safe return paths, verified-user rejection, refresh-cookie propagation, and all legacy entry-point gates. Existing feature regression tests explicitly mock the new closed capability boundary in isolated fixtures so they can test retained feature internals; that does not enable production features.

Dependency remediation includes Next.js/ESLint 16.4.0, compatible transitive updates, and a scoped `engine.io-client → ws ^8.22.0` override to patch Trigger.dev's pinned vulnerable WebSocket dependency without downgrading its SDK. Production audit currently reports **zero vulnerabilities**. The full audit retains five high-severity dev dependency entries along the ESLint `braces → micromatch → fast-glob` chain; npm proposes an incompatible ESLint-config downgrade. No forced downgrade was applied. Recheck advisories and replace/update the affected development tooling when a compatible fix is available.

If a feature fails, turn off its registration/lead flag and redeploy while keeping login and containment intact. For an auth outage, turn off `AUTH_LAUNCH_READY` and use a compatible guarded deployment. Do not restore public buckets, browser grants, demo cookies, or RLS-disabling SQL as a rollback. Preserve auth accounts, profiles, content, leads, and private backups; investigate conflicts explicitly.

Final automated check totals and local HTTP smoke evidence are recorded in the Plan 29 delivery record. Remote setup and user acceptance remain required before any phase is marked complete.

## References

- [Supabase SSR/session refresh](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
