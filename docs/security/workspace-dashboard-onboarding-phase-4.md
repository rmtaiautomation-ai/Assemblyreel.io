# Workspace dashboard and niche setup — Phase 4

October 16, 2026 (Asia/Manila). Implementation is deployed. Local integration and anonymous hosted guards passed; the tester accepted returning-user dashboard/project navigation. The remaining private browser cases are listed below.

Current follow-on: [Phase 5 owned draft editing](owned-draft-editor-phase-5.md). Public email/domain work is [deferred until launch preparation](signup-email-delivery-followup.md). The chronological acceptance notes below distinguish observed browser actions from remaining checks.

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

**Accepted October 16:** release `cdffa26` reached Vercel Ready and the stable URL was verified against deployment `dpl_8vkXwPqbxbaKiZk5AnChTMqc6hDz`. Sixteen read-only anonymous hosted checks passed; evidence is ignored `scratch/dashboard-release-verification.json`. The tester then explicitly answered “Dashboard and project navigation work” to the account-specific sequence: log in as A, view workspace cards, open `New workspace`, see `Draft renamed`, open the saved project and use Back to workspace. This accepts that returning-user route and project navigation in a real signed-in browser. It does not accept new niche setup, Account settings/logout navigation or the new dashboard route's cross-account rejection, which remain separate browser cases.

Use the existing confirmed test accounts; do not create more identities for this module.

**New dashboard isolation acceptance, October 16:** B's dashboard screenshot lists only its two existing test workspaces and omits A's niche workspace. After being given the direct `/dashboard/[workspaceId]` URL of A's niche workspace, the tester explicitly confirmed it returns 404 under B. The tester also reiterated the project-page 404 results in both account directions, already recorded in Phase 3. This accepts the new dashboard's B list isolation and B-to-A workspace-page denial. It does not establish a new reverse workspace-page test or saved preference values not displayed on screen.

**Niche creation acceptance, October 16:** the tester supplied the new workspace page after the instructed Account A setup flow. It shows `Niche setup test`, niche `Self-Improvement & Parables`, project creation controls and a successful projects refresh with no projects. This accepts live niche/workspace creation and post-save navigation. The projects refresh is not a full page reload: persistence through a full reload and foreign-account access to this new workspace route remain pending. The screenshot does not display saved style/ratio/language/duration, so those specific values are accepted only by the recorded local SQL preference test, not this screenshot.

**Account/logout acceptance, October 16:** the screenshot shows A opening `/account?overview=1` with its dashboard link. The tester subsequently explicitly confirmed logout followed by dashboard access leads to Login. Account settings access and signed-out dashboard protection are accepted. A round-trip from Account settings back to dashboard without logout, niche setup and cross-account access to the new workspace route remain unconfirmed browser cases.

1. Log in at `https://assemblyreel-io.vercel.app/login`. Confirm you reach workspace cards, not the temporary account test panel.
2. Open your existing workspace. Confirm only its projects appear, create a draft only if needed, and open an existing saved project. Its Back link must return to the same workspace.
3. Open Account settings and return to Workspaces without a redirect loop. Log out and confirm `/dashboard` and a known workspace URL require Login.
4. An empty test account's new-user flow is independently verified locally; do not delete existing test content just to make an account empty. For live setup, explicitly use Create workspace once if the account has quota available, choose a niche and save. Report the resulting page and persisted preferences; keep passwords private.
5. Recheck the new workspace route with the other account: it must not expose private metadata. Prior Phase 3 tests accept API/project-page boundaries, not a browser route that did not exist then.

Public signup for arbitrary recipients is still a separate unresolved launch dependency. The prior second-account signup failed; the exact provider failure was not verified. The account used for isolation was provisioned privately through Supabase's per-user admin flow, not through normal public signup. Do not claim that admin provisioning accepts public signup or email delivery.

**Ownership clarification, October 16:** after a browser-window mix-up, the tester identified the earlier dashboard showing B's two workspaces as B's session and provided A's dashboard showing `New workspace` and `Niche setup test` with the saved niche. A separate privileged read-only ownership lookup confirmed both named A workspaces belong to A and the two B workspaces belong to B. No ownership changes or content deletion occurred. A full owner-page Ctrl+R is not inferred solely from the dashboard screenshot. Public email investigation now has its own [follow-up](signup-email-delivery-followup.md).
