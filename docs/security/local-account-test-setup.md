# Local registration and sign-in test setup

Date: October 13, 2026. This finishes the account portion of [Phase 11](account-access-phase-11-acceptance.md). Current target: a new empty project named **AssemblyReel Test**, created by the user. The frontend remains on `http://localhost:3000`; there is no Vercel deployment or paid feature activation.

**Superseded target choice:** the user subsequently selected the existing Assemblyreels backend because no free project slot was available. Follow [the existing-project login guide](existing-account-login-setup.md) for the current work. The fresh bundle below remains valid only for a genuinely empty isolated project; it must not be used on Assemblyreels.

## Current blocker and prepared work

This session has no connected browser or Supabase administration tool. Docker and the Supabase CLI are not installed. The existing credentials select the previously reviewed project; no migrations or account requests were sent to it. The user is creating the separate test project.

The prepared setup includes a minimal fresh core schema, the actual account/security migrations 001–007, and read-only installed-boundary checks in one atomic SQL transaction. It does not include legacy editor tables, billing drafts, provider jobs or sample identities. Later job/billing testing needs the additional reviewed schema/migrations from the [Phases 8–10 guide](account-access-phases-8-10-setup.md).

The bootstrap refuses existing Auth users, public tables, storage buckets or noninternal Auth user triggers. If that guard fails, stop and inspect the target; do not remove the guard to force installation. A SQL error rolls back the bundle. Successful reruns are refused rather than overwriting an installed project. This guard checks emptiness, not the dashboard project name; verify the selected target yourself before running it.

## 1. Create the isolated target

Create a new project named **AssemblyReel Test** in your Supabase dashboard. Wait for provisioning. Keep the database password private. Leave public registration off while installing the schema. Do not import old personal records or generated media.

Place the new project's URL and public key in `.env.local`, replacing the old project's values for these keys:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-TEST-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-TEST-PUBLISHABLE-OR-ANON-KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
APP_ACCESS_STAGE=auth_only
AUTH_LAUNCH_READY=false
AUTH_REGISTRATION_ENABLED=false
OWNERSHIP_MIGRATION_READY=false
OWNED_CONTENT_ENABLED=false
ONBOARDING_ENABLED=false
```

Preserve any original credential values privately outside Git before replacing them. A service-role key is not needed for signup, login, profile reads or metadata onboarding. If `.env.local` has an old service-role key, remove it from this test configuration rather than combine credentials from different projects. Leave private uploads, leads, billing, worker dispatch and all costly features disabled. Existing provider credentials are not needed for account testing.

Do not paste passwords, service-role keys or tokens into chat. `.env.local` is ignored by Git. Tell the agent when the project is created and the public settings have been saved.

## 2. Apply the prepared account bundle

Generate the exact current ordered SQL from the repository:

```powershell
npm run prepare:account-test
```

Open the generated `scratch/account-test-setup.sql` and copy it into the **AssemblyReel Test** project's SQL Editor. Verify the dashboard project name before running it. The command above only writes a local SQL file; it does not connect to a backend or execute SQL.

The sources are:

1. `db/auth/test-project/000-empty-core.sql`
2. Auth migrations `001` through `007`, in numeric order
3. `db/auth/test-project/verify-account-setup.sql`

The generator preserves the actual migration function bodies and combines their outer transactions so incomplete setup cannot commit. Do not separately run the fresh core file, `db/database_setup.sql`, old RLS repair SQL, or `db/stripe-schema.sql`. Do not run this bundle on the existing personal project.

On success, the final verification query reports `PASS: installed account/setup database boundaries; real Auth/email/browser tests still required`. Record the date, test-project alias and applied source list. On error, keep the message without secret data and investigate; the bundle is not accepted.

## 3. Configure Supabase email authentication

In **AssemblyReel Test** Auth settings:

- Enable the email/password provider and require email confirmation. Keep anonymous sign-in disabled.
- Set Site URL to `http://localhost:3000`.
- Allow the exact confirmation return URL `http://localhost:3000/auth/callback`. Recovery/email change remain disabled during the first account test; add their documented exact routes only when testing those flows.
- Configure a sender that can deliver to both tester addresses. Supabase's built-in mail service is restricted; use verified project-team addresses where supported or configure custom SMTP. Do not assume arbitrary tester addresses receive mail. See [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).
- Configure provider-side rate limits and, for any public exposure, CAPTCHA. The first test stays on localhost; do not disable configured CAPTCHA to bypass a failing test.
- In **Confirm signup**, use the app's chosen token-hash callback:

```html
<h2>Confirm your AssemblyReel account</h2>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">Confirm email</a></p>
```

The app supplies the exact callback through `emailRedirectTo`. The default code/fragment callback is incompatible with this implementation. Template variables and server-side verification are described in [Supabase email template documentation](https://supabase.com/docs/guides/auth/auth-email-templates).

After the bundle and settings are verified, enable signup in the test backend and set the following local flags:

```dotenv
AUTH_LAUNCH_READY=true
AUTH_REGISTRATION_ENABLED=true
OWNERSHIP_MIGRATION_READY=true
OWNED_CONTENT_ENABLED=true
ONBOARDING_ENABLED=true
```

Those are acceptance flags, not proof that the database was installed. Keep `PRIVATE_MEDIA_ENABLED`, `AUTH_RECOVERY_ENABLED`, `MARKETING_LEADS_ENABLED`, durable jobs and billing/provider flags false for this first test. Private-media testing later requires the matching test service-role key; recovery later requires configured CAPTCHA, recovery proof secret and verified provider abuse controls.

Stop and restart the dev server after changing keys, origin or flags:

```powershell
npm run check:auth
npm run dev
```

`check:auth` reports presence/shape and requested flags only. It does not verify actual email delivery or replace the installed SQL checks.

## 4. Observe the account journey

Use two email addresses you control, A and B. Keep their passwords outside the repository. With the configured test backend:

1. At `/`, see **Sign up** automatically appear alongside Login. Request Early Access remains a separate interest form.
2. Open `/signup`, register A with a password of at least 12 characters, and reach the confirmation-pending page.
3. Try A's login before confirming. Expect a generic failure and no protected account access.
4. Open A's delivered confirmation link. Expect verified account access, then onboarding when enabled. Do not auto-confirm A through an admin shortcut to call email delivery passed.
5. Save setup, refresh, complete it twice and open the saved project. Expect the same owned workspace/project and no provider activity.
6. Log out, use browser Back and request `/account` again. Fresh protected requests must require login. Log in again and verify the correct email and saved project.
7. Register and confirm B in a separate browser profile/private session. Try A's saved project URL and account APIs. Expect no A data; authenticated API foreign lookups return unavailable, and the foreign project page returns 404.
8. Test wrong passwords, invalid/reused confirmation links, resend limits and anonymous protected requests. Record observed responses, not assumptions.

Record results against L11-01, L11-02, L11-03, L11-05 and L11-06 in the [Phase 11 checklist](account-access-phase-11-acceptance.md). Email confirmation may need the user to open their inbox; no inbox is connected here. Recovery, private storage, mock jobs, billing and paid provider tests retain their separate Pending/Deferred states.

## Verification and recovery

The automated tests execute the actual fresh bundle in PGlite, check trigger-created zero-credit identities, repeat-safe onboarding, A/B isolation, denied anonymous/credit writes, refusal of existing content/accounts, and full rollback on failure. These tests do not run a real Supabase Auth server or prove SMTP/cookie/browser behavior.

If real signup fails, capture the safe error code, the fixture alias and backend setting involved. Disable registration if necessary while investigating. Preserve the test project's identities and saved content; do not delete accounts to hide a provisioning problem. Keep the existing personal project's exposure tracked separately. No real user acceptance is recorded until the configured test backend is exercised.
