# Vercel account login test

Date: October 14, 2026 (Asia/Manila). The user selected GitHub-backed Vercel hosting for an actual signup/login test on the existing Assemblyreels backend. This supersedes the earlier localhost-only testing direction. It does not activate ownership, onboarding, generation or billing.

**Preparation checkpoint:** the user reports SMTP saved and hosted Site URL/callback saved for `https://assemblyreel-io.vercel.app`. The CLI is signed in and this checkout is linked to existing project `assemblyreel-io`. The release runner passed 371 tests, four targeted lint checks, production build, TypeScript, private preview bundle and 51 disabled-stage HTTP probes. Its worker bundle step initially failed because the filesystem sandbox denied esbuild's ancestor-directory lookup; the same check passed separately outside that sandbox. The original runner report remains unchanged, recording that initial failure. Production dependency audit found zero vulnerabilities. Actual hosted email/session acceptance remains pending.

The production environment was configured and read back: all 32 reviewed values match, including the existing backend public credentials, exact hosted origin, auth-only stage and enabled signup/login flags. Every other boolean capability in the template is false. No Supabase service key is present in that hosted environment. The beta bulk environment API rejected its request without applying it; standard CLI environment commands completed the configuration and read-back verification.

**Local configuration recovery:** Vercel CLI linking unexpectedly overwrote `.env.local` with development environment values. Recovered it from VS Code saved history, preserving private recovery copies under ignored `scratch/`. Its public Supabase key passed Auth settings lookup and its server key passed read-only Auth inventory. This is an older saved snapshot rather than proof of exact recovery of every previous provider setting; non-auth configuration needs review before those capabilities are used. Avoid future CLI pulls into `.env.local`; use an explicit ignored destination and preserve a current backup first.

## Database and email checkpoint

The existing-project auth upgrade returned its expected PASS result. Read-only checks confirmed unchanged application row hashes, denied anonymous reads and private Storage buckets. Do not replay that successful upgrade or apply the generic ownership migration drafts to this legacy schema.

The user reports **SMTP saved** in Supabase, using Resend. Actual email delivery is still unverified. With `onboarding@resend.dev`, register using exactly the email associated with the Resend account; other recipients require a verified sending domain. Keep the API key only in Supabase SMTP settings. The app supports the default confirmation template through PKCE, requiring the signup browser's verifier cookie. The separate token-hash template is also supported; never combine both schemes in one link.

## Select the hosting project

Sign into the Vercel CLI in the user's terminal with `vercel login`. Select the intended existing project before linking this checkout. Confirm its GitHub repository is `rmtaiautomation-ai/Assemblyreel.io`. Use a stable project or branch URL for the test, not a changing commit URL. A Vercel-generated URL is sufficient; no custom website domain is required.

Before pushing, inspect the selected project's deployment environment. A Git push can trigger its hosting integration. Prepare an initial deployment with account flags off if its configuration cannot be inspected yet. Review the tested commit and confirm private backups, generated scratch SQL, `.env` files and credentials are excluded from Git.

## Hosted environment

Use Next.js with the repository root and current lockfile. Configure these values in the selected Vercel environment, using its exact HTTPS origin:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<existing Assemblyreels Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing project's publishable/anon key>
NEXT_PUBLIC_SITE_URL=https://<selected stable Vercel hostname>
APP_ACCESS_STAGE=auth_only
AUTH_LAUNCH_READY=true
AUTH_REGISTRATION_ENABLED=true
```

The two readiness flags apply only after the selected project's database, SMTP and callback configuration have been reviewed. Keep every other boolean capability flag in `config/auth.env.example` false, including leads, recovery, owned content, private media, onboarding, jobs, costly features and all billing flags. Account-only testing needs no Supabase service key or generation/billing credentials in Vercel. Preserve any pre-existing secrets privately; do not copy them into this guide or Git.

In Supabase URL Configuration, set the test Site URL to that same HTTPS origin and add the exact `https://<selected stable Vercel hostname>/auth/callback` redirect URL. Retain localhost only if still used for local tests. Keep email confirmation required and anonymous sign-in disabled. Changing environment values requires a new deployment.

## Required evidence

1. Production build, TypeScript, release suites and disabled-feature HTTP probes pass before push/deployment.
2. Hosted navigation exposes signup/login; malformed callback links fail safely. Provider, legacy content and billing routes remain closed.
3. Register the Resend account email, observe actual delivery in both Resend and the inbox, and reject login before confirmation.
4. Open the confirmation link in the signup browser/profile, reach the protected account with the correct email, refresh, log out and confirm a fresh protected request requires login.
5. Record reused/expired-link and wrong-password results. A one-address shared-sender test does not establish real two-account email isolation; that acceptance remains pending until a second recipient can receive mail.

Record the deployed commit, stable URL, environment and redacted results in the Phase 11 acceptance guide. Do not include passwords, keys, codes, cookies or confirmation links. No hosted acceptance is claimed until these observations exist.
