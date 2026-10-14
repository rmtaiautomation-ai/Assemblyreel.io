# Workspace actions and APIs — Phase 3

October 14, 2026 (Asia/Manila). Implementation and independent verification are complete. The prior ownership migration and live rollback-only A/B SQL isolation have passed. Hosted workspace capability activation and personal browser acceptance remain deferred until the tester returns.

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

## When the tester returns

Hosted ownership/content flags remain off during this preparation. Before enabling controlled workspace testing, verify the deployed commit and accepted database migration together, then enable only `OWNERSHIP_MIGRATION_READY` and `OWNED_CONTENT_ENABLED`. Onboarding, private media, jobs, billing and all costly capabilities stay disabled.

The existing account panel can create a workspace after controlled activation. Project creation is exposed through the API/server action; the full onboarding/dashboard flow is a subsequent phase. Test creating a workspace, retrying the same operation, listing it, creating/reading/renaming a manual project, the 409/429 messages, and sign-out protection. Record independent real account A/B browser/REST isolation before broader workspace launch. The current Resend shared sender still limits email recipients; synthetic SQL/HTTP sessions do not resolve that limitation.

Login continues to `/account`; no workspace/onboarding redirect change is included in this API phase.
