# Phase 7: resumable setup and the first draft

Date: October 12, 2026. Plan: [29](../../implementation_plans/29-account-access-and-vercel-launch-plan.md).

Status: local code/SQL implemented and verified; remote migration, deployed browser acceptance and two-account testing **pending**. No live database changes, deployment, email or provider calls were performed.

## Available behavior

After login or confirmation, `/account` checks server-saved onboarding state when enabled. Incomplete accounts resume `/onboarding`. Completed accounts can open their saved project from account. The landing page remains public. Leaving setup opens `/account?overview=1`; this does not claim completion or discard saved progress.

Step 1 saves a workspace name/theme and the existing channel format options, or selects an already owned workspace. Existing workspace settings are preserved. Shared `workspace-options.ts` supplies the channel presets, aesthetics, ratios, languages and durations. The old wizard is not activated because its legacy server actions and voice-loading dependencies remain closed.

Step 2 saves a manual topic and can pause before completion. Completion creates an owned workspace if required and a `drafting` project in the same transaction. The read-only `/account/projects/[projectId]` page shows saved topic, workspace and verified email. No script, scenes, narration, images, jobs, rendering or billing is created. Hosted voice selection is explicitly unavailable until accepted hosted generation support exists.

The active pages use verified identity and truthful unavailable billing/generation messages. The legacy dashboard with placeholder identity/mock billing stays behind its existing closed boundary.

## Configuration and migration order

1. Select the isolated staging Supabase project and stable Vercel origin. Complete the applicable remote containment, confirmed identity, recovery and ownership acceptance from [Phases 0–2](account-access-phases-0-2-setup.md) and [Phases 3–6](account-access-phases-3-6-setup.md).
2. Inspect actual schema, grants, constraints and triggers, including `video_projects.status`. The draft RPC explicitly writes `drafting`; ensure that value is accepted. Review any project/workspace insert triggers, database webhooks and separately deployed automation so metadata insertion cannot cause provider work. Preserve old ownerless records; do not assign them to the new tester.
3. Apply the reviewed `db/auth/001` through `006` in dependency order, then [007-resumable-onboarding.sql](../../db/auth/007-resumable-onboarding.sql). Apply each once; these are ordered migration drafts, not a rerunnable historical setup bundle.
4. Configure the existing trusted origin/auth settings and accepted ownership flags. Set `ONBOARDING_ENABLED=true` only on the selected staging deployment after 007 is applied. It requires `AUTH_LAUNCH_READY=true`, `APP_ACCESS_STAGE=auth_only`, `OWNERSHIP_MIGRATION_READY=true` and `OWNED_CONTENT_ENABLED=true`. Keep later costly features closed. No new service-role credential is needed for onboarding.
5. Deploy the app, run the cases below, and record deployment URL, migration evidence and tester results. Local automated success does not satisfy the deployed exit gate.

`npm run check:auth` checks local configuration presence and prerequisites. It cannot confirm applied migrations, provider settings or remote acceptance.

## Persistence, ownership and limits

- One `account_onboarding` row per application identity; RLS permits only that actor's reads. Browser table writes and anonymous access are denied. RPCs derive actor from `auth.uid()` and reject anonymous identities; HTTP/page entry additionally verifies confirmed authentication and profile.
- Settings are a strict bounded object. SQL independently validates keys, types, format choices, names/themes and topic length. An existing workspace must belong to the actor at save and completion.
- Saves carry the expected revision. Identical replay of the last save returns the same revision; changed stale input is rejected. Separate tabs cannot silently overwrite newer state.
- Completion reads saved state under the same per-actor transaction lock as workspace creation. A nonempty topic is required. Repeated completion returns the existing project. Completed state cannot be rewritten through the save RPC.
- New workspaces retain the three-per-account staging maximum. Onboarding creates at most one draft per account and cannot be reset by the browser. Accounts at the workspace limit can reuse an owned workspace. Unknown-owner content is preserved and inaccessible to new accounts.
- SQL saves share the existing 30-per-minute rename bucket; new completion attempts share the 10-per-minute workspace bucket. Exact save/completion retries return before consuming another slot. Completion failure rolls back new records and state together.
- Mutation Origin, JSON shape and 8 KiB stream bounds precede SDK access. Responses are private/no-store. Setup accepts no user, owner, project or provider identifiers as identity.

## Manual acceptance on the deployed staging app

| Case | Expected result |
|---|---|
| Visit `/` logged out and logged in | Landing stays visible; navigation reflects the real session. |
| Log in/confirm a new account A | Incomplete setup opens when enabled; confirmed email is displayed. |
| Save Step 1, leave, reload and log in again | Saved channel settings resume at the topic step; no workspace/project exists yet. |
| Save a topic without completing | Topic survives reload; no provider activity or draft creation yet. |
| Finish setup and double-submit | One workspace and one draft, with matching actor ownership; no duplicate draft. |
| Lose a save/complete response, then retry unchanged or reload | Same saved revision/project is recovered without duplication. |
| Open two tabs and save different choices | Stale tab receives a reload message; current saved state is preserved. |
| Leave/revisit completed setup | Saved project opens; account link and workspace project picker still work. |
| Account already has three workspaces | New workspace completion fails without partial records; choose an owned workspace to finish. |
| Submit unknown choices, blank topic, extra identity fields, bad IDs or oversized JSON | Bounded validation error; no creation or provider work. |
| Log in as account B | B cannot read A's setup, select A's workspace, open A's draft or resume A's state, including direct Supabase reads/RPC calls. |
| Forge cookies, use anonymous session, call from another Origin | Auth/origin error before metadata mutation. |
| Disable onboarding or interrupt the database | Setup becomes unavailable with truthful retry/account navigation; stored progress and owned records remain. |
| Inspect provider dashboards, worker logs, billing and project child rows | Ordinary onboarding created metadata only; no paid requests, script/media, jobs or charges. |

Browser layout, keyboard navigation, back/refresh, mobile sizing and genuine Supabase cookies still require this manual pass. Automated fixtures do not prove live SMTP, session settings or multi-connection race behavior.

## Recovery

Set `ONBOARDING_ENABLED=false` to close application setup and route users back to account. Preserve the state table and created records. Owned project metadata access depends on the separate owned-content flag and can remain available. Never reopen legacy pages or storage as recovery.

If database-level writes must be stopped too, revoke `authenticated` EXECUTE on `public.save_account_onboarding(integer,jsonb)` and `public.complete_account_onboarding(integer)` in the selected project. Application flags alone do not revoke directly callable Supabase RPC grants. Restore these narrow grants only after repair and acceptance; retain the containment/RLS boundaries.

## Local verification

Passed: **27 auth/security tests**, production build, TypeScript, targeted auth/access lint, and **42 local production HTTP checks** with flags off. The temporary local server was stopped after verification. No remote requests or mutations were made by these smoke probes.

The auth suite exercises actual SQL migrations 001–007 in PGlite, plus actual route and Proxy code with explicit auth/network fixtures. It covers save/reload semantics, repeated completion, stale/conflicting input, foreign workspaces and saved state, atomic rollback at the workspace bound, existing-workspace reuse, strict inputs, anonymous denial and closed capabilities. The database tests run locally in one connection; deployment, visual/browser behavior and live multi-connection contention remain pending.
