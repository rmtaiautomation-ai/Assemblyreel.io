# Account access: Phases 3–6 delivery and setup

**Date:** October 12, 2026 (Asia/Manila).

**Status:** code and local SQL fixtures verified; remote activation and manual acceptance pending.
**Reference:** [Plan 29](../../implementation_plans/29-account-access-and-vercel-launch-plan.md) and [Phases 0–2 setup](account-access-phases-0-2-setup.md).

No remote migration, existing-owner assignment, bucket change, CAPTCHA/SMTP setting, email send, paid provider operation, or Vercel deployment was performed. The intended staging Supabase project and stable test origin still need selection. Do not mark these phases accepted based only on the local tests.

## Delivery by phase

| Phase | Implemented locally | Live acceptance still required |
|---|---|---|
| 3 | Forgot/reset screens; recovery callback; HMAC-signed 10-minute proof bound to a verified user/session; current-password change; confirmation-based email change; trusted email-sync trigger; Turnstile integration passed to Supabase; mutation origin checks; 64 KiB Server Action body limit | CAPTCHA and provider rate-limit configuration, SMTP/templates, real password/session and secure email-change behavior, disabled-account checks |
| 4 | Owned-record RLS and grants; owner/parent indexes and checks; composite same-project constraints; server-derived workspace owner; atomic three-workspace limit and idempotency; safe account workspace panel | Actual schema inventory, legitimate owner mapping, orphan/relationship repair, migration application, two-account direct REST/RPC tests |
| 5 | Shared verified-user/profile and workspace/project/resource guards; bounded JSON/binary inputs; safe errors and private caching; atomic shared request limits; pinned-DNS approved-origin import; filesystem-path downloads removed; operation inventory | Real shared-store concurrency tests and hosted unauthorized/malformed request checks |
| 6 | Awaited private uploads with byte verification, durable asset keys and states, retry without overwrite, protected playback signing, owned artifact downloads, provider-free media status | Private bucket configuration, reviewed legacy object mapping/migration, actual upload/expiry/redeploy/playback/export fixtures |

See the [operation inventory](account-access-operation-inventory.md) for every action and handler. Costly generation, rendering submission, old timeline mutations, Stripe endpoints, and the worker remain disabled. There is no flag that reopens them. Safe metadata and private upload/delivery use separate configuration gates; this does not implement onboarding, billing, or background generation from later phases.

## Ordered database continuation

After the inspected and accepted `001` and `002` drafts, review/apply in staging:

1. `db/auth/003-confirmed-email-sync.sql`
2. `db/auth/004-owned-records.sql`
3. `db/auth/005-private-assets.sql`
4. `db/auth/006-account-request-limits.sql`

These later drafts are ordered, one-time migrations. Track which files were applied; do not replay a directory as a migration runner. Inspect the real schema and take private backups first. A fresh staging project needs the reviewed core schema before `004`; do not bulk-replay old scripts that disable RLS or grant anonymous access.

`003` synchronizes `public.users.email` from changes to the authoritative `auth.users.email`. Browser profile updates never change auth authority. Configure secure email change so confirmations are required; requesting a change must not immediately change the login identity. Conflicts abort for explicit repair instead of associating an account by email.

`004` replaces old policies on known resources, grants authenticated **owned reads only**, and adds a restrictive ownership boundary. Ordinary writes go through narrow, validated RPCs. Workspace ownership comes from `auth.uid()` and a real application identity, not request `user_id`. Creation locks by actor, permits three test workspaces, and records the exact payload/operation ID to reject changed retries. Rename accepts only a workspace name or project topic, with bounded length and current ownership. This preserves a small manual metadata path without opening paid features.

Existing unknown owners, orphan relationships, and cross-project references are preserved for review. `NOT VALID` checks/FKs protect **new writes** while old inconsistent rows await repair. They do not certify existing data. Run `db/auth/ownership-audit.sql`, inspect actual additional tables/views/functions, and record explicit legitimate workspace-owner IDs privately. Resolve broken relationships before enabling their content. Validate each constraint only after its old rows are repaired; never assign ownerless content to the next signup.

Known ownership map:

| Resource | Authority |
|---|---|
| `users` | `id = auth.uid()`; only `id,email` readable; no editable credits |
| `workspaces` | `user_id` → application/auth identity |
| `video_projects` | `workspace_id` → owned workspace |
| `scenes`, `media`, `timeline_items`, `overlay_clips`, `act_narrations`, `thumbnails` | `project_id` → owned project |
| `channel_facts` | `workspace_id` → owned workspace |
| `presentation_evidence`, `presentation_suggestion_runs` | `project_id` → owned project; original mutation RPCs stay disabled |
| `private_assets` | owned project, stable asset/media ID, server-derived bucket/key |
| `render_artifacts` | owned project and same-project private asset |
| `account_workspace_operations`, `account_request_limits`, `marketing_leads` | private server/RPC state; no browser table reads/writes |
| Uninventoried public objects, billing drafts, other exposed schemas | stay quarantined; inspect and explicitly approve before enabling |

The three historical RLS-disabling scripts now refuse disabling RLS when the quarantine policy is present. `db/README.md` labels the old run order as historical. Other old DDL and grants still require review; never use bulk replay as deployment setup.

`005` adds private asset/artifact records. Direct browser storage access stays blocked by the restrictive quarantine policy. The server uses its service-role key only **after** verifying current identity, profile, resource ownership, state, and derived key. Profile/metadata operations continue using the user's public-key session. The broad storage key is never returned or bundled in the browser.

`006` supplies atomic per-account, per-minute limits in PostgreSQL, shared across Vercel instances: upload 10, import 5, signing 60, workspace creation 10, rename 30. These are staging protection limits, not approved paid allowances. The private limit table retains at most the recent 24-hour windows when requests prune older entries. Local tests verify rejection at the limit; live multi-connection concurrency remains pending.

## Phase 3 configuration and email templates

Keep all continuation flags off until their actual dependencies pass:

```dotenv
AUTH_CAPTCHA_REQUIRED=false
AUTH_ABUSE_CONTROLS_READY=false
AUTH_RECOVERY_ENABLED=false
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
OWNERSHIP_MIGRATION_READY=false
OWNED_CONTENT_ENABLED=false
PRIVATE_MEDIA_ENABLED=false
PRIVATE_MEDIA_IMPORT_ENABLED=false
PRIVATE_MEDIA_IMPORT_ORIGINS=
```

See `config/auth.env.example`. Generate a private random `AUTH_RECOVERY_SECRET` of at least 32 characters outside Git and configure it server-side. Rotating it invalidates outstanding app recovery proofs without deleting accounts. Configure the Turnstile site key for the allowed local/staging domains; configure its secret **in Supabase Auth's CAPTCHA settings**. Enable CAPTCHA there so direct calls to Supabase are protected too. The app passes tokens to Supabase for verification; a nonempty token alone is never treated as proof.

Configure and test Supabase Auth rate limits for login/signup/reset/resend, password length/strength controls, required email confirmation, secure email change, and disabled/blocked accounts. Set `AUTH_CAPTCHA_REQUIRED=true` with the matching public site key. Set `AUTH_ABUSE_CONTROLS_READY=true` only after testing an invalid challenge and real limits. Recovery requires those settings plus `AUTH_RECOVERY_ENABLED=true` and the secret. Registration/login still need their earlier launch gates. Do not use operator flags as evidence of remotely configured controls.

Allow exact configured callback URLs and use these **token-hash** templates:

```html
<!-- Reset password template -->
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=recovery">Reset password</a>

<!-- Change email template: keep secure email change enabled -->
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email_change">Confirm email change</a>
```

The app supplies `/auth/recovery` and `/auth/email-change` on the trusted `NEXT_PUBLIC_SITE_URL`. Signup uses `/auth/callback`, supporting either its default-template PKCE flow or a token hash with `type=email`. Types are not interchangeable. Recovery and email-change callbacks still intentionally reject code/PKCE links. Wrong origin, duplicate/malformed parameters, expired tokens, and reused links never select an external return destination or echo a secret.

The reset page/action requires a freshly verified recovery session **and** its signed app proof. A normal login session, demo cookie, or forged proof is insufficient. Successful recovery consumes the proof, updates the password, and attempts global refresh-session logout. The normal password-change control verifies the current password through the provider and attempts other-session logout. A revocation failure is reported honestly. Existing access tokens may survive until expiry; test actual provider behavior instead of claiming immediate universal revocation. Provider `getUser()` validates identity on requests, and a returned active ban timestamp is rejected. Verify disabled-account and already-issued-token behavior in the selected Supabase project before acceptance.

Account email change uses the provider's confirmation workflow. Confirm both inboxes when secure email change is enabled, then verify the auth email and application email match. Ordinary workspace/profile edits cannot change that identity. No auth token, password, email link, signed object URL, or provider secret is logged by the new handlers.

## Phase 4–5 safe workspace and metadata use

After migrations and two-account tests, enable `OWNERSHIP_MIGRATION_READY=true` and `OWNED_CONTENT_ENABLED=true`, then redeploy. `/account` shows a small real workspace panel. It creates bounded workspaces and lists existing owned project fixtures. The old wizard now calls the owner-derived server action instead of an anonymous browser insert; the old dashboard itself stays closed until its later onboarding/editor integration.

Enabled metadata endpoints:

- `GET/POST /api/account/workspaces`: owned list or strict, idempotent creation payload.
- `GET /api/account/projects?workspaceId=<uuid>`: verified workspace then bounded owned project list.
- `PATCH /api/account/resources`: `{type:"workspace"|"project", id:<uuid>, value:<bounded text>}`. Other fields/types are rejected.

Mutations require the exact trusted Origin. Server Actions are additionally protected by Next.js origin checks and the 64 KiB body limit. APIs bound streams rather than trusting Content-Length. Errors expose safe codes/messages with private, no-store caching. Foreign resources return unavailable rather than leaking another account's contents.

## Phase 6 storage and request contract

The active bucket contract is **`project-media`** for manual uploads and **`renders`** for later export artifacts. Both remain private. No accidental `media` bucket is created. Keys are:

```text
<trusted actor UUID>/<owned project UUID>/<server-validated asset UUID>
```

Object keys contain no filename, caller path, traversal segment, absolute local path, or arbitrary bucket. Canonical database records store asset IDs and keys. `media.url` is a stable protected `/api/media/<id>/content` route, not an expiring signed URL.

Before applying `005`, inspect existing `project-media` use: the migration sets its manual-upload cap to **3 MiB** and restricts MIME types. Existing objects are preserved, but unrelated software using this bucket must be coordinated. Large provider/video output remains Phase 8 work; do not claim support for long exports under this test asset limit. Existing `renders` bucket limits are not reduced.

Configure a server-only `SUPABASE_SERVICE_ROLE_KEY`, verify buckets/policies, then enable `PRIVATE_MEDIA_ENABLED=true` after hosted checks. The account panel accepts PNG/JPEG/WebP, MP3/WAV, and small MP4 fixtures. File signatures must match the declared MIME; SVG/HTML and unsupported types are rejected.

`POST /api/media/upload` uses a **bounded binary body**, not the old multipart form contract:

```text
Origin: the configured trusted origin
Content-Type: supported exact media MIME
X-Project-Id: owned project UUID
Idempotency-Key: a UUID retained across retries of the same bytes
X-File-Name: encodeURIComponent(filename), maximum 100 decoded characters
Body: file bytes, maximum 3 MiB
```

The panel supplies this contract and retains the operation ID when retrying the same file. Reusing an ID with changed project/type/size/hash is rejected. A reservation is atomic and limited to 100 asset records/10 pending records per actor. These bounded test limits do not authorize paid generation.

Storage upload is awaited, never written to `public/`, and then downloaded privately to verify exact byte size, MIME, and SHA-256. Storage failure produces a failed private reservation, never ready playback. Persisted-but-unfinalized uploads remain recoverable; retry verifies the existing bytes without overwriting them. Failed/pending records are retained for operator reconciliation and count toward the test limits; do not delete them blindly or make storage public to recover access.

`GET /api/media/<id>/status` reads only an owned private asset state. It performs no provider polling or writes. `GET /api/media/<id>/content` rechecks ownership and issues a 60-second playback URL; refreshing the stable route obtains a fresh URL. URLs are bearer credentials during their lifetime and must not be posted publicly or cached/logged unnecessarily. Renderer access for long jobs is not enabled here; Phase 8 must establish the durable job-specific access contract.

`GET /api/render/download?artifactId=<uuid>` verifies the owned artifact, same-project ready asset, `renders` bucket, and MP4 type before signing a short download. The old `?path=...` contract is removed and rejected. No filesystem file can be selected by a caller. Hosted render submission stays disabled; use a small administrator-created staging artifact fixture to test delivery.

URL import stays off by default. To test it, enable `PRIVATE_MEDIA_IMPORT_ENABLED` and supply a comma-separated **exact HTTPS origin** allowlist in `PRIVATE_MEDIA_IMPORT_ORIGINS`. Authorization precedes DNS/network access. Import rejects credentials, arbitrary ports, fragments, private/reserved IPv4 addresses, IPv6 targets, all redirects, oversized responses, unsupported content, and an eight-second timeout. DNS is resolved and pinned to the validated IPv4 connection while TLS still validates the original hostname. No arbitrary URL-fetch endpoint is exposed.

Existing assets are **not automatically adopted** from old public URLs or local files. Review legitimate ownership, source bucket/path, bytes, references, and retention; migrate privately and record compatible IDs/keys explicitly before enabling their playback. Old `public/media` and generated `public/audio` delivery stay blocked. Unknown legacy media gets unavailable instead of a public or local fallback.

## Manual acceptance checklist

| ID | Check | Expected |
|---|---|---|
| P3-01 | Real delivered recovery, wrong/reused/expired link, ordinary login cookie at reset | Only valid recovery/session proof can update password |
| P3-02 | Old/new password, other device, refresh/access-token expiry, disabled account | Observed provider/session behavior recorded accurately |
| P3-03 | Email-change confirmations and identity/profile refresh | Auth and app identity change together after confirmation |
| P3-04 | Failed CAPTCHA, repeated emails/login, foreign Origin | Rejected without secret logs or unbounded sends |
| P4-01 | Two accounts: app and direct REST/RPC select/insert/update/delete attempts | Only own enabled records; no editable owner/credits |
| P4-02 | Explicit old owner, orphan/cross-project references, refresh | Reviewed owners retained; unresolved content stays quarantined |
| P4-03 | Three-workspace limit, parallel/changed retries | Atomic limit and same-payload idempotency |
| P5-01 | Foreign UUIDs, malformed fields, oversized bodies, arbitrary paths/URLs | Safe structured rejection before storage/network/provider effects |
| P5-02 | Multiple Vercel instances hit request limits concurrently | Shared limits hold; no process-local fallback |
| P6-01 | Small real upload; storage/DB failure; same-operation retry | Durable ready bytes or truthful recoverable failure |
| P6-02 | Account B/anonymous access, guessed IDs/keys, signed URL expiry | No unauthorized signing or direct public object access |
| P6-03 | Reload and redeploy, then fresh playback | Stable record persists and gets fresh private delivery |
| P6-04 | Owned small export fixture; foreign artifact and old path request | Owned artifact downloads; others rejected |
| P6-05 | Approved import, rejected redirect/private address/type/size | Only bounded authorized media persisted |

**Target project / stable URL / deployment commit:** Pending.

**Applied migrations and explicit owner map:** Pending.

**CAPTCHA, SMTP, secure email-change, and live rate limits:** Pending.

**Legacy object migration / real storage and artifact fixtures:** Pending.
**User acceptance:** Pending for all P3–P6 cases.

## Verification and recovery

Local evidence: production build and TypeScript pass; targeted auth/access lint passes; **24 auth/security tests, 159 billing tests, and 166 timeline/presentation tests pass**; **38 production HTTP checks pass with activation flags off**. PGlite executes the actual ordered migrations, including inherited-grant quarantine, ownership, limits, same-project relationships, email sync, and asset authority. Mocked SDK tests prove rejection before storage/reservation/signing, byte-checked persistence, safe retries, and recovery-proof consumption. They do not prove SMTP/CAPTCHA delivery, hosted storage semantics, multi-connection concurrency, or Vercel browser acceptance.

Production dependency audit after the Phase 0 security updates reports zero vulnerabilities; the earlier documented development lint dependency advisory remains unresolved without a compatible fix. Browser visual/manual acceptance was not completed: the in-app browser could not initialize in this session. The HTTP and source-level form checks do not substitute for the user's browser test.

Disable the affected recovery/content/media/import flag and redeploy if a dependency fails. Retain login, private content, operations, and recovery evidence. Repair mappings/constraints with reviewed corrective SQL. Never restore public buckets, anonymous grants, RLS disabling, arbitrary filesystem downloads, or service-role access in browser code.

References: [Supabase password flows](https://supabase.com/docs/guides/auth/passwords), [Supabase CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha), [Supabase user updates](https://supabase.com/docs/reference/javascript/auth-updateuser), [Turnstile rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).
