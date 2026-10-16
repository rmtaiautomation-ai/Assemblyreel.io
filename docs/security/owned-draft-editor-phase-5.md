# Owned draft editor — Phase 5

October 16, 2026 (Asia/Manila). Implementation and local verification complete; the live SQL upgrade, activation and signed-in browser acceptance are pending. The hosted dashboard continues working with editing disabled. This handoff does not claim public launch or activation of the full media editor.

## Scope and audit decision

The existing `TimelineEditor.tsx` is retained behind the legacy gate. Its scene/timeline/settings actions write directly to tables; those writes are intentionally revoked by the ownership upgrade. Its empty-project route substitutes casino sample scenes, and its interface calls narration, AI, media import and rendering services. Opening that route would not provide a working owned editor with the currently accepted database permissions and closed media capabilities.

This phase adds an explicitly bounded manual draft editor at `/account/projects/[projectId]/edit`. The owned project page exposes its link only when both editor flags and the existing dashboard/ownership flags are enabled. It is a scene planning and timing interface using the real `scenes`, `timeline_items` and project settings columns; it does not replace the retained media editor or silently enable its providers.

Implemented behavior:

- Load a consistent owned snapshot; show a genuine empty state without mock scenes. No Storage path, playable URL, provider metadata, email, token or credit field enters its DTO.
- Add manual scenes, edit narration/visual description and duration/source trim, reorder scenes, and remove scenes created through this RPC. Imported/existing scenes can be edited but cannot be removed here. Unselected scene columns, attachments and overlays are preserved.
- Add, edit and remove A1/A2 timeline metadata using ready audio already belonging to this project. Reject foreign media, wrong media types and clips extending beyond a known audio duration. No upload, synthesis, playback or Storage delivery occurs. Projects without audio still support scene editing.
- Save captions and V1/A1/A2 lock/mute/volume settings in the columns used by the retained editor. Lock is stored for that media editor, not enforced as a prohibition on editing narration in the draft planner.
- Explicit Save, saved/unsaved/failure status, frozen retry body/UUID after uncertain writes, and Reload saved draft. Edits stay in memory on failed saves/loads. Controls lock while an uncertain save needs resolution. Terminal failures require reload before another write.
- Confirm destructive scene/clip removals and discarding unsaved edits. Reload/close warnings and link-click confirmation protect common navigation paths. Browser history navigation, device shutdown and tab crashes do not provide durable unsaved-draft recovery; there is no localStorage copy of project content.

## Database contract and limits

[008-owned-draft-editor.sql](../../db/auth/existing-project/008-owned-draft-editor.sql) is specific to the already upgraded text-project database. The number is a migration filename, not a request to activate the separate Phase 8 billing work. Do not run generic onboarding/billing migrations with it.

The transaction checks the operator role, existing ownership backup namespace/helper, required column types, RLS and direct-write containment. It adds only a project revision column, a manual-scene marker and a protected operation receipt table, plus two RPCs. It does not copy, reparent, delete or rewrite existing application records during installation. Old scenes default to a protected marker; existing project revisions start at zero. Replay or incompatible schema fails instead of partially activating.

`read_owned_editor(uuid)` verifies the stored confirmed, nonanonymous, nonbanned account through `account_owned_actor()` and joins project → workspace owner. A project share lock keeps its revision and child rows consistent with this save RPC. The result is a minimal JSON snapshot. Missing and foreign projects both produce `RESOURCE_UNAVAILABLE`.

`save_owned_editor(uuid,integer,uuid,jsonb)` repeats authorization and validates field names/types/ranges inside SQL, so browser calls to PostgREST cannot bypass the HTTP schema. A project update lock serializes saves. The expected revision rejects stale tabs with `EDITOR_CONFLICT`; exact operation replay returns its original acknowledgment without another write or rate hit. A different body/revision/project/actor with the same operation UUID yields `OPERATION_REUSED`. Receipts store a SHA-256 fingerprint, not repeated copies of scene scripts.

Scene/timeline UUIDs cannot move between projects, including a racing `ON CONFLICT` insert. Scene creation/order/allowed edits, explicit snapshot removals, timeline edits, settings, revision and receipt commit in one transaction. Any failure rolls all of them back. Direct browser table writes remain revoked and legacy ownership/Storage policies are unchanged.

Limits: 200 scenes, 200 timeline clips, 500 ready media records on read, scene text fields 10,000 characters each, scene duration 0.1–600 seconds, source trim 0–7,200 seconds, total scene timeline at most two hours, 30 successful new saves per actor/minute, and 10,000 operation receipts per project. The browser rejects request bodies above 240,000 UTF-8 bytes; HTTP streaming and SQL JSONB each enforce a 262,144-byte hard limit. Oversized or invalid saved data produces an unavailable editor, never a truncated draft that could erase unseen records.

Both RPCs have empty search paths and restricted execution grants. They use the current authenticated session, never a hosted service key. Migration application grants their authenticated SQL capabilities; the application flags control app entry points, not revocation of an already installed SQL function.

Future background/generated-content writers must participate in this project revision/locking contract before they coexist with full-snapshot saves. They are closed for this release. Do not activate paid generation alongside this editor merely by changing flags.

## Files and verification

- `src/features/owned-editor/`: strict document/DTO schema, client retry contract and manual editor interface.
- `src/server/access/owned-editor.ts`: feature, identity, RPC and safe-response boundary.
- `src/app/api/account/projects/[projectId]/editor/route.ts`: private GET/PUT, exact trusted Origin on writes and bounded JSON streaming.
- `src/app/account/projects/[projectId]/edit/page.tsx`: confirmed account, owned load, foreign/invalid 404 and safe unavailable state.
- `db/auth/existing-project/test-owned-editor.sql`: rollback-only synthetic role test for the selected live database. No passwords, sessions, email delivery, Storage bytes or customer edits.

Local evidence recorded October 16:

- Auth/security suite: 87 tests passed, including seven SQL/API/client editor cases. Two additional rendered-component handler tests passed afterward: an uncertain save keeps its text and frozen retry, and a conflict plus failed reload preserves local text until a successful reload. These use an isolated React hook harness, not a real DOM/browser.
- Actual Next/SSR SDK HTTP suite: 17 checks passed, including owned editor SSR/empty state, signed-out and foreign rejection, private headers, origin/field/body limits, real SQL persistence through a fresh page request, a deliberately dropped committed-save response, exact replay and stale/changed-operation conflicts. Evidence: ignored `scratch/workspace-http-acceptance/2026-10-16T04-20-55.640Z/`.
- Offline replay against the prior private exported public schema, constraints, triggers and data passed all 30 checks. Every original value in all ten exported tables was preserved; the existing 778 orphan scenes and 161 Storage inventory records remained intact. The new rollback SQL passed against that replay. Evidence: ignored `scratch/account-backups/ownership-2026-10-14-lyArln/editor-migration-replay.json`. This is an older backup replay, not a fresh live catalog or hosted SQL acceptance.
- PGlite tests cover stored identity rejection, foreign project/scene/item/media links, SQL input forgery, protected scene removal, direct writes, save rate bounds, rollback after an injected late failure, operation replay and revision conflicts. Simultaneous promises on PGlite's single connection verify competing revision behavior; they do not simulate independent PostgreSQL connections contending on locks.
- Existing timeline regression suite: all 83 tests passed. The synthetic session/recovery HTTP suite passed all 11 checks, with evidence in ignored `scratch/auth-session-acceptance/2026-10-16T04-25-18.340Z/`.
- Final production build (including Next's TypeScript check) and targeted lint passed. The production environment was read without changes: both editor switches are absent (therefore disabled); the accepted dashboard/ownership switches remain enabled and private-media/costly switches remain false. No hosted editor activation occurred.

No live editor writes, paid provider requests or new real users were made by these tests. Signed-in visual/browser acceptance is still pending; SSR HTML checks do not replace it.

**Disabled release verified October 16:** implementation commit `85cc92856d072ec9c2c961a0bf4dccfdddc4ac92` reached Vercel Ready as `dpl_8VmPjL4Sa1s8RyMzdpAu1hcHLfnf`. The stable `assemblyreel-io.vercel.app` alias was verified against that deployment. Twelve anonymous read-only hosted checks passed for Login redirects, owned API denial, the disabled editor API, closed media/jobs/render features and private cache headers. Evidence: ignored `scratch/owned-editor-disabled-release-verification.json`. This publishes the prepared code with both editor switches disabled; it does not apply SQL or accept signed-in editing. A documentation-only follow-up commit may redeploy identical application code.

## Activation and tester return

The agent has no authenticated SQL management connection in this session. `DATABASE_URL` is not a verified target and must not be used as a shortcut. Finish implementation/tests first, then request only this concrete operator step:

1. In the existing **AssemblyReels** Supabase project SQL Editor, run the whole [008 migration](../../db/auth/existing-project/008-owned-draft-editor.sql) as postgres. The transaction contains drift guards and a five-second lock timeout. If it fails, stop and return the error label; do not weaken the guards or replay the prior ownership bundle.
2. Run the whole [editor rollback test](../../db/auth/existing-project/test-owned-editor.sql). Return its final `PASS` text, or the error label. Never replace its `ROLLBACK` with `COMMIT`. Existing account/workspace/project counts must remain unchanged by this test.
3. After that PASS, set production `EDITOR_MIGRATION_READY=true` and `OWNED_EDITOR_ENABLED=true` together, redeploy, verify Ready/alias and signed-out page/API guards. Keep the existing ownership/dashboard switches and all paid/media switches unchanged. Do not claim this step occurred before recording its deployment evidence.
4. With existing Account A, open its existing draft → Edit draft. Add two short scenes, edit narration/duration, reorder, toggle captions/volume and Save. Refresh and reopen after logout/login to confirm persistence. Avoid creating more workspaces. The second account must get 404 for the same editor page and API; its own content must remain unchanged.
5. In two tabs, load the same project revision, save one and then save the other. Expect an explicit conflict, preserved local text and a successful Reload saved draft. A real signed-in lost-response test is optional; synthetic HTTP already covers that case without touching customer data.

Disabling `OWNED_EDITOR_ENABLED` and redeploying removes app entry without deleting saved draft metadata or receipts. Do not drop columns/tables or restore the old ownership backup to turn off the interface.

## Deferred and subsequent work

Public arbitrary-recipient email delivery is [explicitly deferred until launch preparation](signup-email-delivery-followup.md). Existing confirmed accounts remain the development testers.

After this manual editor acceptance, the next independent capability is private media delivery/upload and then integration of those assets into the retained interactive timeline/preview. Generation, narration, rendering, billing and public launch each retain their own readiness and acceptance requirements. This phase does not mark them complete.
