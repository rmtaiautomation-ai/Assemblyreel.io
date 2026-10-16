# Workspace dashboard and niche setup — Phase 4

October 16, 2026 (Asia/Manila). Implementation and local integration verification complete; private hosted browser acceptance is pending deployment/tester verification.

## User flow

Successful login and confirmation retain the safe `/account` destination. When `WORKSPACE_DASHBOARD_ENABLED=true` and both reviewed ownership/content flags are true, Account routes to `/dashboard`. The dashboard queries only the verified actor's owned workspaces. An empty account routes to `/onboarding`; an account with workspaces sees its workspace cards. Account settings remain available at `/account?overview=1`.

Niche setup reuses the existing niche/style/aspect/language/duration choices and creates the workspace through the accepted `create_owned_workspace` API/RPC. It then opens `/dashboard/[workspaceId]`. That workspace page lists owned draft projects, creates a draft through `create_owned_project`, and supports the accepted rename operations. The saved project metadata page links back to its workspace. Users with existing workspaces can deliberately start another via `/onboarding?new=1`; ordinary onboarding visits return them to their dashboard.

The flow is a metadata dashboard, not activation of the full video editor. It performs no narration, AI, render, Storage, billing, job or external integration work. The retained legacy `/workspaces` pages/actions stay blocked. Legacy ownerless workspaces remain unassigned. Existing test workspaces remain visible to their test owners.

## Database and feature boundaries

No database migration is added or required. The older resumable onboarding feature depends on unaccepted generic migration 007 and stays disabled (`ONBOARDING_ENABLED=false`). The new flow does not read `account_onboarding`, invoke its RPCs or enable that API. Do not apply generic 007 to enable these screens.

Only the separate `WORKSPACE_DASHBOARD_ENABLED` switch enables this routing. Turning it false and redeploying restores the prior Account/testing flow without deleting data. Ownership/content flags, server-side verified identity, profile checks, explicit ownership and database RLS/RPC protections are unchanged. Both page handlers and Proxy protect dashboard/setup routes. A foreign or malformed workspace gets not-found; provider failures show a retry message without treating the account as empty or offering an accidental duplicate setup.

Workspace and project creation freeze the original request during an uncertain retry. A mismatched or malformed success result is not accepted as a completed save. Failed project-list refresh after a confirmed save is reported separately. Retry state lives in memory only: keep the page open until confirmed. This flow saves completed workspaces, not incomplete form drafts across logout/reload. Persistent multi-step draft onboarding is a separate capability.

## Verification

- 80 auth tests passed, including the independent dashboard switch/Proxy boundary and saved niche preference tests against the actual ownership SQL fixture.
- 13 local actual Next.js/SSR SDK/SQL HTTP scenarios passed. New coverage: signed-out dashboard/setup rejection, login handoff to dashboard, empty-account niche setup, returning-account workspace cards, explicit additional-workspace setup, owned project listing, foreign workspace rejection and closed old onboarding API.
- Existing 11 auth HTTP regressions passed. No real email, account credentials or hosted writes are used by either synthetic HTTP suite.
- TypeScript, production build and targeted lint passed before release. See the release result recorded by the agent; do not infer hosted browser acceptance from the local suites.
- HTTP evidence: ignored `scratch/workspace-http-acceptance/2026-10-16T03-31-13.463Z/` and `scratch/auth-session-acceptance/2026-10-16T03-31-50.146Z/`.

## Tester return

Use the existing confirmed test accounts; do not create more identities for this module.

1. Log in at `https://assemblyreel-io.vercel.app/login`. Confirm you reach workspace cards, not the temporary account test panel.
2. Open your existing workspace. Confirm only its projects appear, create a draft only if needed, and open an existing saved project. Its Back link must return to the same workspace.
3. Open Account settings and return to Workspaces without a redirect loop. Log out and confirm `/dashboard` and a known workspace URL require Login.
4. An empty test account's new-user flow is independently verified locally; do not delete existing test content just to make an account empty. For live setup, explicitly use Create workspace once if the account has quota available, choose a niche and save. Report the resulting page and persisted preferences; keep passwords private.
5. Recheck the new workspace route with the other account: it must not expose private metadata. Prior Phase 3 tests accept API/project-page boundaries, not a browser route that did not exist then.

Public signup for arbitrary recipients is still a separate unresolved launch dependency. The prior second-account signup failed; the exact provider failure was not verified. The account used for isolation was provisioned privately through Supabase's per-user admin flow, not through normal public signup. Do not claim that admin provisioning accepts public signup or email delivery.
