# Local channel UI recovery

**Checked:** 2026-10-08 (Asia/Manila)

## Findings and local recovery

The existing channel hub and settings routes returned Next.js's generic HTTP 404, not
the application's own missing-workspace message. Their source files existed and the
production build's route manifest included them. Restarting only this project's verified
local Next.js development process restored dynamic route resolution. The original trigger
for the stale development route state was not established.

The fresh server then logged `UNABLE_TO_VERIFY_LEAF_SIGNATURE` while connecting to
Supabase. Node **24.12.0** with `--use-system-ca` successfully established a verified TLS
connection. Relaunching the dev server with that flag restored database-backed pages.
`package.json` now includes the flag in `npm run dev`, so the secure startup survives a
normal restart. No TLS verification bypass, global environment change or credential
change was made. The coding-standards skill guided a one-script startup change rather
than weakening data access or changing unrelated application components.

Read-only HTTP checks after recovery:

| Route | Result |
|---|---|
| Workspace list | HTTP 200; affected channel link present |
| Affected channel hub | HTTP 200; Production Snapshot present, no missing-workspace state |
| Affected channel settings | HTTP 200; Channel Settings and Visuals tab present |
| One existing video editor in that channel | HTTP 200; Visuals UI present |
| That video's Scene Board | HTTP 200; application page present |

The current browser connection tool failed to initialize; these checks establish server
responses, not a claim of an authenticated browser workflow passing. The creator should
refresh the existing tab and report any subsequent sign-in/setup message. Voice Studio
connection and an existing media-decode warning were also observed; neither caused the
generic channel-route 404 and neither service/asset was changed.

## Presentation activation still required

Zero-row, read-only schema probes using the configured public Supabase client found:

- `overlay_clips.scene_id` is missing (`42703`).
- `video_projects.presentation_visual_settings` is missing (`42703`).
- `public.presentation_evidence` is absent from the API schema cache (`PGRST205`).

Therefore the configured database does not yet satisfy Module 26's presentation
prerequisites. This check did not inspect private row contents or mutate the database.
Restoring the route does not activate template persistence or reviewed AI.

Before activation, identify the intended environment, retain a recoverable backup,
verify existing ownership and real authentication, and review/apply these files in order:

1. `db/add-scene-template-presentations.sql`
2. `db/add-documentary-template-library.sql`
3. `db/add-presentation-suggestions.sql`
4. `db/add-documentary-phase-4.sql`
5. `db/add-documentary-phase-5.sql`

Do not fabricate owners, bypass sign-in or enable paid suggestions to make the controls
appear working. Applying live database migrations requires a separate user decision;
**none was applied during this recovery**. Hosted v4 rendering and approved real-source
pilots also remain separate gates, as recorded in [Phase 5 readiness](phase-5-readiness.md).
