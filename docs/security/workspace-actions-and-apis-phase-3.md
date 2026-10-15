# Workspace actions and APIs — Phase 3

Updated October 15, 2026 (Asia/Manila). Backend implementation and independent verification are complete. The prior ownership migration and live rollback-only A/B SQL isolation have passed. Minimal account-panel controls are implemented and the two hosted ownership/content settings are enabled for controlled testing. Actual signed-in browser/provider acceptance remains pending; this module is not yet closed.

## Implemented operations

| Endpoint | Method | Operation |
|---|---|---|
| `/api/account/workspaces` | GET | List owned workspace names/themes; bounded to 50 rows |
| `/api/account/workspaces` | POST | Create owned workspace with an operation UUID |
| `/api/account/workspaces/[workspaceId]` | GET | Read minimal owned workspace details |
| `/api/account/projects?workspaceId=...` | GET | List minimal projects of one owned workspace; bounded to 50 rows |
| `/api/account/projects` | POST | Create owned manual project metadata with an operation UUID |
| `/api/account/projects/[projectId]` | GET | Read minimal owned project details |
| `/api/account/resources` | PATCH | Rename an owned workspace or change an owned project topic |

The matching server actions are `createWorkspace`, `createProject`, `renameResource`, `listWorkspaces` and `listProjects` in `src/features/workspaces/server/owned-workspace-actions.ts`. Actions and routes use the same server data-access functions.

Creation bodies are strict objects:

```json
{"workspace":{"name":"My channel","content_theme":"History"},"operationId":"<new UUID>"}
```

```json
{"project":{"workspace_id":"<owned workspace UUID>","topic":"My manual draft"},"operationId":"<new UUID>"}
```

Rename bodies are `{"type":"workspace|project","id":"<owned UUID>","value":"<new name or topic>"}`. Workspace names are limited to 100 characters; project topics to 200. UUIDs are normalized to lower case. Workspace preferences are validated against the database's supported choices. Unsupported fields, including owner IDs, project status, credits and generation settings, are rejected.

## Boundaries

- Every route/action requires verified confirmed, non-anonymous, non-banned identity and a matching application profile. Feature flags guard the services as well as routes; actions cannot bypass the guard.
- Mutations require the exact configured origin. HTTP mutations require bounded JSON bodies. Invalid input is rejected before authentication/database work when possible.
- Workspace access is explicitly filtered by the verified actor. Project access also checks its workspace owner. Foreign, missing and unassigned resources receive the same safe 404 response.
- Use the authenticated SSR client only. No service-role client, Storage, email or paid provider is used by these operations. Database RLS/RPC authorization independently enforces the boundary.
- Remove the earlier external `admit_account_request` calls for workspace creation and rename. The reviewed ownership RPCs count these mutations transactionally; each successful new creation/rename is counted once, and idempotent creation retries do not duplicate records or consume another creation count.
- Reusing an operation UUID with changed details returns HTTP 409. Keep the original UUID/details to retry after an uncertain response; use a fresh UUID for a deliberately new save. A missing or mismatched RPC result never claims success.
- Quotas return 409, request limits 429, unavailable identity 401, ownership failures 404 and unknown provider errors a generic 503. Raw provider diagnostics are not returned.
- Success and failure responses use private/no-store, no-cache and nosniff headers. Responses contain only selected metadata, without credits or private media URLs.

This phase implements creation, reads and renames supported by the reviewed RPCs. Deletion, other settings edits, media delivery, onboarding completion, editor access and generation remain separate capabilities. Existing unknown legacy owners stay unassigned. No additional database migration is needed for these handlers.

## Independent verification

- **75 auth tests passed**, including six new integration cases that run the actual TypeScript actions/handlers against the schema-specific ownership RPCs/RLS in an isolated PGlite database.
- **Eight actual HTTP scenarios passed** through local Next.js, the real Supabase SSR SDK, a synthetic loopback Auth/REST provider and the same local SQL rules. They cover missing session, workspace/project creation and replay, private lists/dynamic details, A/B ownership rejection before RPC, rename, origin/owner forgery/invalid IDs and exact request counts.
- TypeScript, the production build, targeted access/API/action/test lint and diff checks passed. The existing **11 auth HTTP regression scenarios** also passed against actual Next.js and the SSR SDK. Its ignored evidence is `scratch/auth-session-acceptance/2026-10-14T07-59-27.888Z/report.json`.
- The HTTP suite uses synthetic identities/cookies and an isolated database. It sends no real email and mutates no live customer record. It is independent implementation verification, not live Supabase browser/provider-session acceptance.

Run the new repeatable suite when no other Next.js dev server is running:

```powershell
npm run test:workspaces:http
```

It starts/stops its local servers and writes ignored evidence under `scratch/workspace-http-acceptance/`. The accepted run for this phase is `2026-10-14T07-58-19.521Z/report.json`. The migration fixture is shared with its existing isolation tests so API tests exercise the same confirmed-account and ownership rules.

## Closure phases — October 15

| Phase | Status | Acceptance |
|---|---|---|
| 3A: Prepare live controls | Implemented and independently tested | Account panel supports workspace/project creation, selection, refresh and rename; uncertain creation retries keep the original details and UUID. |
| 3B: Controlled activation | Two Vercel settings configured; deployment evidence recorded privately | Enable only `OWNERSHIP_MIGRATION_READY` and `OWNED_CONTENT_ENABLED`; verify signed-out requests fail and other capabilities stay closed. |
| 3C: Live acceptance | Pending private signed-in tests | Record real account persistence, retries, authorization failures and independent A/B provider sessions. |
| 3D: Close module | Pending 3C | Fix failures, rerun affected checks and record acceptance. |

**Updated independent verification:** 78 auth tests passed, including three request-helper tests; ten workspace HTTP scenarios passed, including a deliberately lost response after committed creation, safe replay and actual SQL quota/rate thresholds returning HTTP 409/429. Thresholds are seeded only in the isolated fixture, without flooding the hosted service. Eleven auth HTTP regressions, TypeScript, targeted lint and production build passed. All 33 live read-only preservation/access checks passed again before activation. Evidence: `scratch/workspace-http-acceptance/2026-10-15T09-23-03.329Z/` and `scratch/auth-session-acceptance/2026-10-15T09-23-20.909Z/`.

The pending save is retained in memory only: keep the page open and use **Retry save** until confirmed. Fields are locked during an uncertain retry. A confirmed save followed by a failed list refresh is reported as saved, with a separate refresh action. No full dashboard/onboarding flow is introduced.

The previous hosted settings are saved privately in `scratch/workspace-activation-before.env`. The activation changes only the two reviewed flags, verifies unrelated non-Vercel settings remain unchanged and confirms no hosted service-role key. Onboarding, private media, jobs, billing and costly capabilities remain disabled. To withdraw access, set both ownership/content flags false and redeploy; editing environment settings alone does not alter a running deployment. This stops application access without undoing the SQL migration or deleting content. Never replay the accepted migration for rollback.

## Private live acceptance

1. Log in at `https://assemblyreel-io.vercel.app/login` with the existing confirmed account. Earlier account acceptance used `rmt.aiautomation@gmail.com`; this is separate from the legacy ownerless sample content. Keep passwords, cookies and links private.
2. On `/account`, create **one** test workspace. Select it, create **one** manual project, and rename both with the panel controls.
3. Refresh, select the saved workspace/project again and confirm the renamed values persist. Open the saved project and return to Account.
4. Log out, then open `/account` and the saved project address directly. Fresh requests must require Login and show no content.
5. Arrange a second confirmed test account in another browser profile/device. Record A/B reads and mutation attempts against the other account's known test IDs: all must be denied, and lists must never contain the other's records. Accommodate the Resend recipient restriction without disabling confirmation or CAPTCHA. SQL role/local HTTP passes do not replace this step.

Live retry/conflict and bounded concurrent-save checks use known test operation UUIDs through authenticated requests. Never ask the tester to paste session tokens into chat. Hosted quota/rate acceptance remains unperformed; the independent local results are above. Do not flood the live service or create extra records just to reach limits. Do not mark unperformed cases PASS. New test records are owned by their test account and count toward the three-workspace/ten-project quotas; deletion is outside this module. Old workspaces remain unassigned.

Login continues to `/account`; no workspace/onboarding redirect change is included in this API phase.
