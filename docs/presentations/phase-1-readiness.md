# Documentary presentation library — Phase 1 readiness

Reviewed on 2026-10-07 (Asia/Manila). Implementation started on 2026-10-06.

**Status:** Phase 1 code and local fixture verification are complete. Live database activation, an authenticated owned project, approved pilot images, and a compatible deployed Lambda site are still release checks. No remote migration, deployment, provider generation, or Phase 2 implementation was performed.

## What the creator gets

Select a scene in the Timeline Editor and open **Presentation → Browse templates**. The initial library contains **D03 Image Comparison** and an explicit **Use clean media** choice.

The comparison editor includes:

- Two ready project images selected by their durable media IDs; no pasted browser-only image URL.
- Independent labels, crop/whole-image fit, horizontal/vertical focal points, and a swap control that moves the image and its metadata together.
- An optional heading, Dark Documentary and Parchment Archive themes, accent override, paper/thin/no frame, and curved-grid/plain background.
- Small-to-large or fade entrances, together/staggered reveals, and calm/standard/expressive motion.
- Start offset within the scene and either a fixed hold or a hold that follows the scene end.
- Credit, source link, and historical/illustration/reconstruction/unknown classification per image. Reconstruction is visibly identified on the video; source URLs are retained as metadata, not fetched or printed as body text.
- Unsaved 16:9, 9:16, and 1:1 previews, a safe-margin guide, and manual playback. Changing the preview ratio does not change project export settings.
- Apply, Edit/Preview, Remove, and immediate one-step Undo per scene in the current editor session.
- “Keep my edits” on by default. Content/style/timing edits restore this lock; an explicit uncheck can save an unlocked presentation. AI replacement is not implemented in this phase.

The modal is responsive, traps keyboard focus, supports Escape/Cancel, and returns focus on close. Drafting does not write to the database. All required content must be ready before Apply.

Labels are limited to 60 characters, headings to 100, and credits to 90. These are input bounds, not guarantees that every possible glyph combination fits every ratio. The loaded fonts and browser layout determine the actual fit. Text wraps at fixed readable sizes, image space has a minimum, and overflowing copy produces a useful error instead of a clipped export. Shorten copy for dense square layouts; the UI does not silently rewrite it.

## Data and persistence

The additive migration is `db/add-scene-template-presentations.sql`. Prerequisites are the existing `workspaces`, `video_projects`, `scenes`, and `media` tables plus:

1. `db/create-overlay-clips.sql`
2. `db/add-overlay-clip-templates.sql`
3. `db/add-overlay-ai-origin.sql`

Existing `overlay_clips` rows stay in place. New presentations use `kind = 'scene-template'`, a real `scene_id`, `time_basis = 'scene'`, versioned template/theme JSON, revision, lock, and operation identity. A composite foreign key prevents attaching a row to a scene in another project; a partial unique index allows one presentation per scene. Deleting the owning scene cascades its attachment.

`mutate_scene_presentation` verifies the signed-in actor through project/workspace ownership and locks the scene before insert/replace/delete. It requires both expected row ID and revision, preventing stale writes and delete/recreate identity confusion. Repeating a committed save operation with identical input returns the canonical row; changing input under that operation ID is rejected. Save failures do not partially replace content. Server data supplies provenance hashes.

Owned RLS is enabled for the whole overlay table. A restrictive ownership policy also constrains older permissive policies. Legacy owned overlays retain their write path; attached rows must use the atomic service. A trigger prevents direct authenticated writes from bypassing revision protection while permitting an owned scene's FK cascade.

The web action independently checks authentication, project, scene, and media readiness. No subscription check or paid provider call is required for content editing. Export and render-progress polling now also require project ownership. Export reads authoritative saved presentations and resolves their media IDs again, ignoring client-supplied nested URLs. Unsupported versions, unavailable media, unreadable timing, and unexpected read failures block export.

Undo restores the previous content/timing/lock through the same revision-protected service; it is not a permanent project history. Reloading clears the local Undo stack. Another editor's subsequent save must be reviewed rather than overwritten by Undo.

No automatic conversion or deletion of old free overlays is included. They remain independent and can render above the new scene presentation; review/remove a conflicting legacy overlay explicitly. Applying Clean does not remove those overlays.

## Timing, layout, and export

- The compiler rounds each local offset at the actual FPS and clamps the presentation to its owning scene. Reordering changes the derived project position, not the stored offset. Trimming recalculates the available hold; unreadable holds are flagged.
- Presentations render inside the existing scene transition wrapper, including transition pre-roll, rather than as a second global overlay. Their OV-lane representation is display-only: clicking selects the owning scene; timing is edited in Presentation, not by free-overlay drag/trim.
- Landscape and square use two columns; portrait stacks the cards. Font-loaded text measurement happens on content/layout changes, not on every animation frame.
- Comparison projects use the shared documentary caption geometry, including space for a two-line caption page and entrance travel. Their caption size/position is consistent throughout the project. Projects with only legacy templates retain the old caption styling.
- Declared nested image slots are absolutized and passed through the existing local cache/cloud media mapper without modifying saved IDs or configuration.
- The actual Remotion project exposes both `MainVideo` and `MainVideo-Documentary-v1`. Lambda submissions with an attached presentation require the latter. An old deployed site fails with an unavailable composition rather than silently dropping the new graphic; legacy-only submissions retain `MainVideo`.

Local rendering is verified. No AWS submission, live storage sync, signed-URL lifetime test, or hosted render parity is claimed. The versioned composition alias prevents silent omission; it is not proof that a deployed site's media/font access works.

## Local verification evidence

| Check | Result |
|---|---|
| Presentation test suite | 34 passed, including the Phase 0 regressions. |
| Actual migration in isolated PGlite | Applied twice; verifies owned access even with permissive legacy policies, retry/revision handling, atomic failure, Undo restoration, identity protection, guarded direct writes, legacy-row preservation, and scene cascade. |
| Actual web save/export code with stubbed Supabase I/O | Validates boundary checks, atomic RPC arguments, canonical replay, conflict/setup messages, owned nested media resolution, and pre-attachment legacy fallback. |
| Actual cloud preparation/submission code with stubbed Lambda I/O | Traverses nested images through the existing URL mapper, preserves the input, and selects the required composition alias. No AWS request was made. |
| `npm run typecheck` and `npm run build` | Passed. |
| Focused lint on new modules, renderer payload/local path, route, fixtures, and runners | Passed. Broader touched-file lint still finds pre-existing `any` errors/unused code in `s3-sync.ts` and an unused helper in `lambda-render.ts`; these unrelated diagnostics were not rewritten. |
| Actual shared Remotion rendering | 46 PNG stills, three six-second H.264 clips, and zero unexpected browser errors. Both themes, all three ratios, captions on/off, entrance/hold/exit, long copy, and attached transition samples. |
| Deliberately excessive copy | Three expected render rejections: maximum combined square content in both themes and a glyph-heavy square case. Shortened square copy renders successfully. |
| Actual Presentation panel/Player/CSS browser fixture | 13 workflow checks and three screenshots; no unexpected browser errors. Includes unsaved draft, selection, labels, ratio preview, overflow disabling Apply, recovery, swap, apply, reload, remove, Undo, mobile, and Escape. Five expected React error-boundary diagnostics occurred during deliberate overflow/recovery. |
| Legacy render recheck | All 60 fixtures rendered without browser errors. 59 PNG hashes exactly match the Phase 0 corrected reference. One portrait AI-title PNG differs in 57 of 1,555,200 channel values, maximum delta 8/255; side-by-side review found no layout/content change. No claim of 60 byte-identical captures. |

The browser save boundary is simulated local storage; it is not an authenticated Supabase end-to-end test. SQL tests execute the real migration, and server tests execute the real action/export logic, but their isolated fixtures do not establish a live environment's schema, grants, or project access.

Synthetic image fixtures are authored and labeled as test content, not historical evidence. Verified local artifacts are ignored by Git:

- `out/presentations-phase-1/verified/`: 46 stills, three MP4s, and the render report.
- `out/presentations-phase-1/verified-ui/`: desktop/portrait/mobile screenshots and the 13-check report.
- `out/presentations-phase-0/phase-1-legacy/`: legacy captures and comparison report.

Earlier scratch capture directories are not acceptance evidence. Remotion emitted a non-fatal webpack cache snapshot warning; the verified rendering completed successfully.

Repeat checks with new, unused capture labels:

```powershell
node --test tests/presentations/*.test.mjs
npm run typecheck
npm run build
npx eslint --no-ignore src/lib/presentations src/features/presentations src/remotion/presentations src/remotion/captions/layout.ts src/remotion/Root.tsx src/server/rendering/render-payload.ts src/server/rendering/local-renderer.ts src/app/api/render-remotion/route.ts scripts/presentations tests/presentations
node scripts/presentations/render-phase-1.mjs review-new
node scripts/presentations/check-ui.mjs ui-review-new
node scripts/presentations/render-baseline.mjs legacy-review-new after-verified
```

Browser/font access is required. On this Windows sandbox, the esbuild-based isolated UI runner required approved execution outside the sandbox; this was not used to access customer content.

## Activation and remaining release checks

1. Select the intended staging database, retain the Phase 0 read-only overlay inventory and a recoverable backup, and review existing grants/ownership policies. Do not run the old table-creation script after the new migration: it explicitly disables RLS.
2. Establish a real authenticated user owning the selected workspace/project. `src/proxy.ts` still bypasses auth for development; a dummy development user is not a verified Supabase session. No sign-in flow or account migration was added here. Without a valid session, saves/export correctly refuse access. Do not disable RLS to bypass that requirement.
3. Apply the reviewed Phase 1 migration to that selected environment and verify owned legacy overlay access plus cross-project denial there. No remote migration has been run by this task. Missing RPC setup is reported by the editor instead of falling back to unprotected writes.
4. For cloud export, deploy the compatible Remotion site exposing `MainVideo-Documentary-v1` before activating presentations. Confirm actual nested uploaded images, URLs, fonts, and preview/local/Lambda parity using the same saved scene.
5. Run the complete creator workflow on an authenticated real project: apply/edit/reload, reorder, trim, conflicting edits, Undo, scene deletion, local export, and cloud export if enabled. Fixture coverage is not a replacement for this live smoke test.
6. Review an approved Enoch and Mesopotamia image/source pair. Latin typography is the verified path; original-language shaping and fonts remain future scoped work.

The **local Phase 1 implementation gate passes**. The **hosted release gate remains open** until those checks are satisfied. Phase 2's remaining families, Scene Board/Visuals settings, and Phase 3 AI suggestions are not included.
