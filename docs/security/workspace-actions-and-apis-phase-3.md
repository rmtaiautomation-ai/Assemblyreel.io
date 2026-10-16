# Workspace actions and APIs — Phase 3

Updated October 15, 2026 (Asia/Manila). Backend implementation and independent verification are complete. The prior ownership migration and live rollback-only A/B SQL isolation have passed. Minimal account-panel controls are implemented and the two hosted ownership/content settings are enabled for controlled testing. Core controlled-test acceptance is recorded below. Additional hosted resilience/limit coverage and public-launch dependencies remain explicitly open.

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
| 3B: Controlled activation | Deployed and hosted guards passed | Only `OWNERSHIP_MIGRATION_READY` and `OWNED_CONTENT_ENABLED` enabled; signed-out requests fail and other capabilities stay closed. |
| 3C: Live core acceptance | Accepted for the two controlled accounts | Creation/read/rename/persistence/logout, both read and rename isolation directions, foreign-parent denial, replay and conflict results recorded below. |
| 3D: Final review/handoff | Core API implementation and controlled-test handoff complete | Explicit follow-up coverage and launch restrictions retained; not unrestricted public-launch approval. |

**Updated independent verification:** 78 auth tests passed, including three request-helper tests; ten workspace HTTP scenarios passed, including a deliberately lost response after committed creation, safe replay and actual SQL quota/rate thresholds returning HTTP 409/429. Thresholds are seeded only in the isolated fixture, without flooding the hosted service. Eleven auth HTTP regressions, TypeScript, targeted lint and production build passed. All 33 live read-only preservation/access checks passed again before activation. Evidence: `scratch/workspace-http-acceptance/2026-10-15T09-23-03.329Z/` and `scratch/auth-session-acceptance/2026-10-15T09-23-20.909Z/`.

The pending save is retained in memory only: keep the page open and use **Retry save** until confirmed. Fields are locked during an uncertain retry. A confirmed save followed by a failed list refresh is reported as saved, with a separate refresh action. No full dashboard/onboarding flow is introduced.

The previous hosted settings are saved privately in `scratch/workspace-activation-before.env`. The activation changes only the two reviewed flags, verifies unrelated non-Vercel settings remain unchanged and confirms no hosted service-role key. Onboarding, private media, jobs, billing and costly capabilities remain disabled. To withdraw access, set both ownership/content flags false and redeploy; editing environment settings alone does not alter a running deployment. This stops application access without undoing the SQL migration or deleting content. Never replay the accepted migration for rollback.

## Private live acceptance

**Accepted October 15:** screenshots show the confirmed account creating/selecting `Phase 3 test` and `First manual draft`, opening the saved project, then viewing renamed values `New workspace` and `Draft renamed`. The tester explicitly confirmed both persisted after logout and a fresh login. The tester subsequently confirmed that, while logged out, opening both Account and the saved project requires Login; the supplied screenshot shows `/login?next=/account` without private content. This accepts owned creation, reads, rename, persistence and signed-out direct-page protection for that account. Independent A/B provider-session isolation, live retry/conflict/concurrency and hosted quota/rate cases remain pending.

Release `dfd73c2` reached Vercel Ready and serves the stable URL. All 14 signed-out hosted checks passed, including rejected workspace reads, private-page login redirects and closed onboarding/media/jobs/generation/billing routes. Private evidence: `scratch/workspace-activation-release.json`. No real signed-in browser test is inferred from these anonymous HTTP checks.

**Second-account partial acceptance, October 15:** the operator created a separate account for `rommeltima07@gmail.com` through Supabase's administrator Create User flow, confirming only that test identity. The normal signup attempt had failed with a generic registration error; its exact provider cause is not yet verified, so unrestricted public signup/email delivery is not accepted. Project-wide confirmation and CAPTCHA remain enabled. Screenshots show the second account signed in, a successful saved-content refresh with an empty workspace list, and a 404 without private details when opening the first account's known saved project. Later screenshots show B creating and opening its own `Account B draft` project. In the separate Incognito session identified as A, opening B's known project also returns 404 without details. This accepts B's initial list isolation, legitimate B creation/read and project-page read denial in both directions. A's refreshed list after B's creations and live cross-account API mutation denial are still pending. The two B workspaces visible in the screenshots are retained as operator-created test records; no further workspace creation is needed.

**Additional acceptance, October 16:** A's refreshed Account screenshot shows only `New workspace` and a successful refresh, with no B workspaces. A then submitted a same-origin PATCH to `/api/account/resources` for B's known test project, using its existing topic as the requested value. The console screenshot records HTTP 404 and `RESOURCE_UNAVAILABLE`. This accepts A's refreshed list isolation and A-to-B project rename rejection through the deployed API. Reverse B-to-A API mutation rejection, foreign-workspace project creation rejection and live save retry/conflict/concurrency remain pending. No hosted quota/rate result is inferred.

1. Log in at `https://assemblyreel-io.vercel.app/login` with the existing confirmed account. Earlier account acceptance used `rmt.aiautomation@gmail.com`; this is separate from the legacy ownerless sample content. Keep passwords, cookies and links private.
2. On `/account`, create **one** test workspace. Select it, create **one** manual project, and rename both with the panel controls.
3. Refresh, select the saved workspace/project again and confirm the renamed values persist. Open the saved project and return to Account.
4. Log out, then open `/account` and the saved project address directly. Fresh requests must require Login and show no content.
5. Arrange a second confirmed test account in another browser profile/device. Record A/B reads and mutation attempts against the other account's known test IDs: all must be denied, and lists must never contain the other's records. Accommodate the Resend recipient restriction without disabling confirmation or CAPTCHA. SQL role/local HTTP passes do not replace this step.

Live retry/conflict and bounded concurrent-save checks use known test operation UUIDs through authenticated requests. Never ask the tester to paste session tokens into chat. Hosted quota/rate acceptance remains unperformed; the independent local results are above. Do not flood the live service or create extra records just to reach limits. Do not mark unperformed cases PASS. New test records are owned by their test account and count toward the three-workspace/ten-project quotas; deletion is outside this module. Old workspaces remain unassigned.

**Reverse mutation acceptance, October 16:** following the instruction to use B's signed-in browser, the tester supplied the reverse PATCH console result for A's known project: HTTP 404 and `RESOURCE_UNAVAILABLE`. Together with the prior A-to-B result, cross-account project rename denial is accepted in both directions. The screenshot contains the request and result but not account identity; identity attribution follows the tester's execution of the account-specific instructions. Foreign-workspace project creation rejection and hosted retry/conflict/concurrency remain unperformed.

**Hosted replay acceptance, October 16:** B fetched its existing project details and issued two concurrent POST requests with the original project operation ID, workspace ID and original `Account B draft` payload. The console screenshot shows both responses are HTTP 201 with the existing project ID. This accepts concurrent replay of an already committed creation operation. It does not establish simultaneous first-time creation behavior, changed-payload conflict rejection, or recovery after an actually lost hosted response. Those distinctions remain explicit; local lost-response verification is recorded above.

**Hosted conflict acceptance, October 16:** B reused the original project operation ID and workspace with a changed topic. The supplied console screenshot records HTTP 409 and `OPERATION_REUSED`. Changed-payload replay rejection is accepted. The screenshot alone does not establish a subsequent unchanged-topic read; verify that separately before final closure.

**Foreign-parent acceptance and read-only aftermath, October 16:** B attempted project creation with a fresh operation UUID inside A's known test workspace. The console screenshot records HTTP 404 and `RESOURCE_UNAVAILABLE`. Subsequent privileged read-only verification found A's topic still `Draft renamed`, B's topic still `Account B draft`, exactly one project in A's test workspace and one original operation record for each known project. This accepts B-to-A foreign-parent creation rejection and unchanged topics after the rejected rename/conflict attempts. Concurrent replay did not create a second copy of either known project. Reverse foreign-parent creation, simultaneous first-time creation, an actually lost hosted response and hosted quota/rate boundaries have not been exercised. Local fixture results cover these only where explicitly recorded; do not imply all hosted cases passed.

Login continues to `/account`; no workspace/onboarding redirect change is included in this API phase.

## Final review — October 16

The implemented workspace/project metadata API scope has no observed failing case in its recorded automated, SQL-role, anonymous hosted and two-account live tests. Core implementation and controlled-account handoff are complete. This review does not retroactively accept unperformed hosted scenarios. Reverse foreign-parent creation, simultaneous first-time creation, an actually lost hosted response and hosted quota/rate thresholds remain follow-up coverage before broader exposure; local tests cover quota/rate enforcement and lost-response retry, as recorded. Public signup email delivery is unresolved and remains a launch dependency. No additional live accounts, destructive cleanup or quota-filling requests are required for the completed evidence.

Dashboard/niche routing proceeds separately in [Phase 4](workspace-dashboard-onboarding-phase-4.md), using accepted RPCs without generic onboarding migration 007. Its dedicated switch controls whether login proceeds through Account into the dashboard. Legacy editor, paid features and Storage delivery remain closed.
