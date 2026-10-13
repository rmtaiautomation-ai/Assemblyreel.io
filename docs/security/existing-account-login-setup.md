# Existing Assemblyreels — local signup and login activation

Date: October 13, 2026. The user selected the existing **Assemblyreels** Supabase backend because both available free active-project slots are in use. The app stays on localhost. GitHub push is conditional on successful account testing; no Vercel deployment has been performed.

**Latest intended target:** the user now wants the code saved in GitHub and a Vercel-hosted signup/login test, with Resend for confirmation delivery. This supersedes the earlier localhost-only testing direction. No push/deployment or Resend setup has occurred yet. Vercel's generated URL can host the test without a custom website domain. Resend's shared `onboarding@resend.dev` sender can deliver test emails only to the email associated with the Resend account; arbitrary recipients require an owned verified domain. Configure the exact hosted origin/callback before activating hosted registration. Commit application code/docs only; keep local backups, generated private SQL and secrets out of Git. Hosted account acceptance remains pending.

**Resend test-sender clarification — October 14, 2026:** the earlier blanket statement that all Resend testing requires a domain was too broad. [Resend documents its shared sender restriction](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain): use `onboarding@resend.dev` for a one-recipient test to the Resend account email, rather than inventing an address at `resend.com`. Its [SMTP settings](https://resend.com/docs/send-with-smtp) are host `smtp.resend.com`, port `465`, username `resend`, password the private Resend API key. Enter these in Supabase custom SMTP, with sender name AssemblyReel and the shared test sender. This provides a scoped test path to verify; actual Supabase SMTP delivery has not been observed. It does not enable two-independent-address/customer acceptance without a verified sending domain. No provider account, key, settings mutation or test email has been created by the agent.

## Reviewed state and chosen first milestone

The exported preflight confirms zero Auth users and zero application profiles, seven ownerless workspaces, 18 projects, 2,050 scenes and 527 media records. `scenes.project_id` is text while project IDs are UUID; 778 scene references have no matching project. Two buckets are public. These are existing personal-tool records, not customer accounts.

The first upgrade activates the database prerequisites for signup, confirmation, login, protected minimal account reads and logout. It preserves existing content, owner fields and column types. Old content remains quarantined; a new signup does not become its owner. Ownership/onboarding activation is deferred until the actual schema mismatch, orphan relationships and owner mapping have a reviewed continuation. Do not run generic auth 004–007 directly against this schema or turn on their readiness flags.

## Completed private backup

Read-only GET/list/download operations exported all nine public application tables and 161 Storage objects totaling **92,814,253 bytes**. Local SHA-256 verification passed; a second application row read matched the saved row exports. No provider calls, account creation, remote writes or permission changes occurred during the backup.

The local files and manifest are in ignored `scratch/account-backups/assemblyreels-wXHYQ5/`. The schema/grant report is `scratch/account-access-preflight.csv`. These contain private application content or metadata: preserve them locally and do not add them to Git.

This is an application row/object export, not a full PostgreSQL/platform backup. The upgrade also captures original public function definitions, the supplied grant/policy/schema metadata, application rows and Storage metadata in a private SQL-time backup schema. Auth users were empty; no auth credentials were exported. SQL-time copies alone are not an independent backup. Neither operation exports platform SMTP settings, signing keys or hosting configuration; those are not modified by the SQL.

Backup verification proves the files checked at this checkpoint. It is not a concurrent PostgreSQL snapshot or a rehearsed full-platform disaster restore. Stop any remaining old writers before applying; counts and schema drift cause the upgrade to refuse execution, and the SQL-time copies preserve the state under the upgrade's table locks. No rollback should restore anonymous/public access.

To repeat preparation if the backend changes:

```powershell
npm run backup:account-existing
npm run prepare:account-existing
node scripts/auth/check-existing-auth-fixture.mjs
```

The first command performs read-only remote requests and writes only local backups, using the existing server-only key without printing it. It refuses existing Auth accounts, unreviewed buckets, large objects or changed application rows. The second validates saved file hashes and matching configured project, then writes SQL locally. The last replays exported schema/application data in an in-memory PostgreSQL fixture; it has no network SDK. Do not delete earlier backups to make a failed run appear complete.

## Applied existing-project SQL

On October 13, 2026, the user supplied the expected SQL Editor PASS result. Subsequent read-only live checks confirmed that all nine application table exports still match their backup SHA-256 hashes, anonymous REST reads of all nine tables return HTTP 401, and all three Storage buckets are private. A sampled legacy public object URL returned HTTP 400 without serving the object. Auth still has no accounts; email signup is enabled and email autoconfirm is false. These checks do not prove email template/return URL configuration or browser acceptance. Do not replay the successful upgrade.

The applied file was `scratch/account-existing-auth-upgrade.sql`, copied in full into **Assemblyreels → SQL Editor** and run once.

This is the new **existing-project** file. Do not run `scratch/account-test-setup.sql`; that is still exclusively for an empty project.

The generated existing-project file:

1. Takes bounded table locks and refuses changed schema, row counts or Auth triggers, newly existing users, and an already-started upgrade.
2. Creates `account_access_backup_20261013`, inaccessible to public/anon/authenticated/service roles, for SQL-time recovery records.
3. Applies the actual auth 001–003 containment, identity and email-sync logic in one transaction. The existing managed `storage.objects` RLS is asserted rather than unnecessarily altered; its restrictive quarantine policy is installed.
4. Makes all existing buckets private; revokes legacy browser/schema/RPC/column grants; exposes only authenticated own-row `users.id,email`; provisions zero-credit profiles through the trusted Auth trigger.
5. Checks the installed grants, RLS, Storage policy and backup isolation before committing. No scenes, projects, objects or workspaces are deleted or adopted.

The expected result is:

```text
PASS: existing content preserved; signup/login database prepared; email settings and local activation pending
```

Send the observed result to the agent. If an error occurs, keep the safe error text and stop; the transaction rolls back. Do not bypass the guard, replay old RLS repair files or delete backup schemas. The local auth flags remain off until successful remote installation and configuration are observed.

### SQL Editor warning review

The editor may flag destructive operations because the upgrade replaces old policies and Auth triggers. The executable migration has no `DROP TABLE`, `TRUNCATE` or row deletion. Content-preservation checks passed against the exported application schema/data. Changing permissions and making buckets private is intentional and will close legacy public access.

The generated file now explicitly enables RLS on all twelve private backup tables in addition to revoking schema/table access; final verification refuses missing backup RLS. If the editor still shows an RLS warning, use the plain execution option (`Run without RLS`) to execute this reviewed file unchanged. That option does not strip its explicit RLS statements. `Run and enable RLS` appends dashboard-generated statements, which are unnecessary here. This behavior was verified in [Supabase's SQL Editor source](https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/SQLEditor/SQLEditorLayout.tsx). Always replace previously pasted editor contents with the regenerated complete file before retrying.

## After SQL success: email settings and local activation

In Assemblyreels Auth configuration, require email confirmation, keep anonymous sign-in disabled, set Site URL to `http://localhost:3000`, and allow the exact return URL `http://localhost:3000/auth/callback`. Enable email/password signup when ready for the test.

The user clarified that `assemblyreel.io` is only a planned name and the app is on localhost; no SMTP provider is configured. The dashboard locks template editing without custom SMTP. For this local test, keep the default confirmation template: the app now accepts its PKCE code callback and exchanges the code using the signup browser's verifier cookie. Open the confirmation email in the same browser/profile used for signup, on the computer running localhost. A different browser/profile without that verifier is rejected. No sending domain or custom template is required for this limited test.

Use an email address belonging to a member of the Supabase organization: the default mail service refuses other recipients and currently limits sending to two messages per hour. Custom SMTP is still needed for broader recipient testing/customer delivery. If configuring it later, enter credentials privately in Supabase; the existing token-hash template remains supported as an alternative:

```html
<h2>Confirm your AssemblyReel account</h2>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">Confirm email</a></p>
```

Code and token-hash parameters cannot be mixed in a single callback. Code exchange additionally checks identity with Auth `getUser`; all successful identities must be confirmed and non-anonymous. Redirect destinations stay fixed. See [Supabase PKCE flow](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates) and [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp). Do not disable confirmation to get around mail delivery failures.

After the SQL/configuration results are provided, the agent can set local values without replacing your existing project URL or public key:

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
APP_ACCESS_STAGE=auth_only
AUTH_LAUNCH_READY=true
AUTH_REGISTRATION_ENABLED=true
```

Keep ownership/content/onboarding, media, lead, recovery, billing, job and costly-provider flags false for this login milestone. Keep any configured provider-side rate limits/CAPTCHA intact. Public auth exposure and recovery have additional abuse-control gates. This does not approve public customer launch.

Restart the dev server after configuration changes. Verify the backend remains the reviewed Assemblyreels project before submitting the test account:

```powershell
npm run check:auth
npm run dev
```

## First real account test

Register an email you control, verify that unconfirmed login fails, open the delivered confirmation link, check the real email on `/account`, refresh, log out, and verify protected requests redirect to login. Test wrong password and reused confirmation. Repeat using a second confirmed tester where email delivery permits; own profile reads must not expose the other identity or old personal content. Do not expect metadata onboarding or the old editor to open in this milestone.

Record observed cases in the [Phase 11 checklist](account-access-phase-11-acceptance.md). Only after the account checks pass should the verified code be pushed under the user's instruction. GitHub does not apply database changes or email settings; a connected hosting integration may deploy on push and must retain guarded configuration.

## Evidence and remaining work

Local tests cover generated upgrade preservation, private backup access denial, zero-credit identity provisioning, own-profile isolation, schema-drift rejection and full transaction rollback. The offline replay also used the actual exported application columns, constraints and all saved rows. The complete auth suite and targeted lint results are recorded in Plan 29.

Remote SQL application and the read-only containment/data checks passed. Default-template PKCE callback support passed all 39 auth/security tests, auth lint and TypeScript checks, including real SSR-client rejection without the signup verifier cookie. Local return URL configuration, activation, real confirmation-email delivery, real browser/cookie/login acceptance and the conditional GitHub push remain pending. Owner mapping, text/UUID references, orphaned scenes, onboarding, private media and paid jobs retain their later acceptance requirements.
