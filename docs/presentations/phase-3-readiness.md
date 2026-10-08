# Documentary presentation library — Phase 3 readiness

Reviewed on 2026-10-07 (Asia/Manila).

**Status:** Phase 3's local suggestion/review implementation and isolated verification are complete. Paid AI activation, approved billing terms, a real authenticated project, hosted execution/render verification, and human-reviewed Enoch/Mesopotamia evaluation remain release gates. No real model call, remote migration, cloud deployment, subscription activation or Phase 4 work was performed.

This extends [Phase 2](phase-2-readiness.md) and [plan 26](../../implementation_plans/26-documentary-scene-template-library.md). Local fixture success is not a claim that model selections have already passed human suitability evaluation.

## What is built

- **Suggest presentation** in the Timeline and Scene Board's selected-scene Presentation inspector.
- **Suggest presentations** on Scene Board act headers; results remain scene-keyed even when locked/manual scenes are filtered out.
- A shared review workspace with proposed families, plain-language reasons, up to two alternatives, before/proposed family summaries, changed-field scope, source/timing requirements, pacing notes and selective Apply.
- A project-owned **Reviewed source library** using the existing typed manual editors and Remotion preview. Creating/approving source content does not modify a scene or call AI. A selected scene's saved content can be reused as the starting point for explicit source review.
- Editable proposal previews in all three ratios. Applying an edited draft requires a creator-review checkbox and records a manual/user origin. A direct accepted selection records AI origin; both start locked with Keep my edits on.
- Source-aware eligible candidates, exact narration cue occurrence checks, a deterministic pacing pass, input snapshots, durable request identities, metered provider integration and revision-protected application.
- The Visuals clean preference now guides suggestions as a soft pacing preference. It never enforces the old 40% graphics/clean quota or restyles existing scenes.

There is no unattended auto-apply, image procurement, background removal, OCR, translation generation, inferred geography/genealogy or new template family in this phase. Existing basic/legacy Edit Director workflows are preserved, not silently migrated to the new library.

## Source-safe filling: deliberate first implementation

The director selects **candidate IDs**, not arbitrary family JSON. Each ready graphical candidate is materialized by copying a creator-approved typed source packet, then applying the project's existing visual defaults. Dates, exact passages, translations, coordinates, graph relationships, image IDs/crops and credits cannot be invented or changed by the model response.

This makes source-sensitive filling bounded and inspectable. It intentionally trades open-ended factual auto-writing for fidelity to supplied evidence. The frozen channel fact snapshot supplies verified anchors for ranking; it does not magically supply missing manuscript pixels, translation fields or map coordinates.

Source packets are project-scoped, capped at 30, revisioned, and require an explicit creator approval through the manual editor. Every declared source needs a credit and a known historical/illustration/reconstruction classification. Human approval is not a scholarly or licensing guarantee; the UI asks the creator to review identity, attribution, rights, accuracy and timing. A source link alone is not approval. Missing/deleted media and uncredited packets never become ready solely because their IDs exist.

The model sees each source packet's content once per window, not duplicated for every target scene. Runtime image URLs are not supplied for vision analysis; this is a text-based selection service, not an image-identification model. An unrelated approved packet can still be selected poorly: narration/source fit remains a human review responsibility.

## Eligibility, timing and pacing

| State | Meaning / permitted action |
|---|---|
| Ready | A supplied candidate passes current typed content, owned ready-media and readable-duration checks. Eligible for reviewed Apply; not a guarantee of semantic correctness or every possible glyph layout fitting. |
| Needs assets | Required source images/background are unavailable. No direct Apply. Repair manually or choose a validated alternative. |
| Needs source review | Required typed source content is absent, uncredited or unclassified. Prepare/approve a source packet or explicitly author and review a manual draft. |
| Needs timing review | Duration/cues are unsuitable or narration timing is estimated. Align/re-record, extend/shorten, or explicitly inspect/edit timing. No direct batch Apply of a non-ready candidate. |
| Protected | Locked and unsupported saved presentations are excluded before provider work. Unlocked manual presentations also require explicit inclusion; they are not default replacements. |

Clean is always considered, but it is ready only with usable background media. Graphical candidates must be allowed in the frozen/project Visuals settings and use a known family/version. Image availability does not establish that the image depicts the required source.

The director receives full target narration, including negations and uncertainty, frozen channel format rules, verified frozen fact anchors, supplied source content, neighboring narration/families and recent selection history. Requests use at most eight eligible scenes per window and 48 target scenes overall. Larger acts use individual scene suggestions in this first UI. Context outside a window is bounded to its two preceding/following scenes; successive windows carry recent family history. No video-wide diversity quota is claimed.

Cue phrases are literal script substrings with a zero-based occurrence internally. A cue is resolved to measured scene-relative word timing only when the whole scene's normalized word sequence matches the stored alignment. Case-altered/missing/out-of-range phrases fail. Missing or inconsistent alignment remains estimated at scene-start and requires timing review rather than a guessed timestamp. Cue reveal offsets inside a packet remain authored and are revalidated against the available hold.

The pacing pass may select a **ready, already-returned clean alternative** to break repeated dense graphics. It cannot invent a replacement family/content to hit a quota. Graphics-rich can keep intentional repetition with a warning. Creator selection of an alternative remains explicit and editable.

Actual text/collision measurement is still performed by the existing font-loaded Player/renderer, with repair errors instead of silent shrinking. Review previews use the project's caption setting. Batch readiness is structural/asset/timing readiness; creators should preview dense/source-sensitive candidates before batch Apply. No new server-side browser layout-measurement job is claimed.

## Application, provenance and recovery

Suggestions are separate durable rows, not saved scene presentations until Apply.

- A database-owned snapshot hash covers registry version, scripts/order/durations, master/per-act narration and timings, frozen facts/format, project Visuals/captions, source packet content/revisions and media identities/URLs/status/version metadata.
- The target presentation ID/revision is captured separately. The hash excludes attached presentation rows so earlier successful applications from the same act review do not invalidate all later targets; target CAS and locks protect those mutable rows.
- Apply rechecks current typed content/owned assets in the action and repeats the source hash, ownership, lock and expected-row checks in the database. It loads the stored choice itself; browser readiness flags and arbitrary new candidate IDs are not authority.
- Project/source/default mutations and existing media updates cannot cross the protected database application check. Application locks its target scene; a batch is still separate transactions, not a globally serializable/atomic project rewrite.
- Edited drafts are an explicit manual-authoring exception, validated through the same compiler and stale/lock/CAS path. They record user origin, not AI-verified evidence.
- Each successful new presentation is locked. Later manual edits restore user origin and clear its AI attachment metadata. Source packets themselves are not rewritten by applying a suggestion.
- The normal one-step session Undo is populated from the canonical mutation result in both editors. It remains revision-safe and session-local, not durable project history.
- Batch Apply uses stable operation IDs per request/scene/choice/draft, reports per-scene failures and continues with other selected targets. Repeating an identical committed application returns its canonical saved result; changed content under that identity is rejected. Locked scenes remain protected even if an older review called them unlocked.
- Updating/removing a source packet stales old suggestions but leaves existing saved scene content intact. It does not retroactively destroy rendered projects.

The newest matching saved requests can be recovered when opening review. **Check saved requests** distinguishes complete and pending/unknown requests. Pending/unknown requests are not blindly sent to the vendor again. Recent-run UI is limited to the newest ten project requests; the database retains the durable run records. No automated reconciliation daemon, general history browser or partial-generation resume worker was added.

## Provider and billing boundary

The new director reuses `src/lib/ai/openai-provider.ts` and its existing `AGENT_MODEL` (`gpt-4o` at this review). It does not migrate the project's other agents/models. Output only contains scene/candidate IDs, alternatives, reason and cue phrase/occurrence. Provider responses and the complete result are validated again locally; malformed, refused, truncated or mismatched output is not interpreted as ready.

The [official OpenAI structured-output guidance](https://developers.openai.com/api/docs/guides/structured-outputs) documents schema-based output and refusal/incomplete-response handling. This implementation preserves the repository adapter's non-strict JSON-schema settings, so it does **not** claim strict-mode guarantees; Zod, candidate allowlists and application checks remain authoritative. This source check informed the failure handling without introducing another provider client or a new model choice.

The shared `runMeteredGeneration` boundary derives billing resources and quantities on the server. No browser-supplied credits/quantities are accepted and no parallel credit counter is introduced.

- One ledger operation per window: `<request UUID>:<window index>`.
- Maximum output: 2,600 tokens; prompt plus system text limited to 100,000 UTF-8 bytes; provider retries disabled; each provider call has a 60-second abort signal.
- Conservative token reservation: input UTF-8 bytes + 16,000 protocol/schema allowance + the output cap. This is an upper-bound budget, **not an exact tokenizer count or actual token invoice**.
- The existing billing utility commits its reserved quantity on confirmed completion; it does not settle to actual token usage. Commercial approval must explicitly review this cap-based accounting, or separately extend the shared billing settlement policy before enabling paid access. No exact-usage or low-cost promise is made here.
- Uncertainty is persisted in the ledger before the vendor boundary. Timeouts, malformed output, storage failures and generic errors never imply confirmed no-work or automatically release quota.
- Validated partial output and available provider request identity are retained before settlement/final completion. A failed run remains non-applicable until reconciled; no duplicate provider call is made by replaying its request ID.

**Activation is off by default:** `PRESENTATION_AI_ENABLED` must explicitly be `true`, and the existing approved billing runtime/catalog, real owner authentication and server API credentials must also be ready. The catalog is currently empty, so flipping the presentation flag alone cannot authorize a paid call. Manual editing, source preparation and review/application of saved content are not a new paid provider operation.

Long-act execution time, host action timeouts, actual provider responses, usage accounting and reconciliation need staging verification before launch. Persisting run state is not a guarantee that an interrupted interactive request resumes automatically. The service accepts trusted dependencies without request cookies; the existing legacy Trigger autopilot still uses an unsuitable request-cookie path and was **not** connected or activated. A future worker requires an approved trusted job adapter, not a copied browser session.

## Database and file map

The new additive migration is **`db/add-presentation-suggestions.sql`**, after the Phase 1 and Phase 2 migrations. It has not been applied remotely.

It adds owned `presentation_evidence` and `presentation_suggestion_runs` tables, protected source mutation/snapshot/apply functions, and suggestion-reference columns on attached overlays. Browser roles can read their owned records but cannot write trusted suggestion runs. Only the verified server/service-role boundary stores model results. The existing scene CAS core becomes private; the public manual wrapper preserves its API and restores manual origin. Run/source records cascade with the owning project; independent legacy overlays are not converted.

Migration ordering matters: rerun earlier migrations only as part of a reviewed migration sequence ending in Phase 3. A later Phase 2-only function replacement would bypass the new wrapper's origin handling. Rollback should disable new generation/writes and preserve compatible readers; do not drop tables/columns or delete saved presentations.

| Area | Files |
|---|---|
| Pure eligibility/evidence/cue/pacing contracts | `src/lib/presentations/suggestions.ts` |
| Provider-specific structured selection | `src/lib/ai/agents/presentation-director.ts` |
| Owned snapshot normalization, including measured word timing | `src/features/presentations/server/suggestion-context.ts` |
| Shared metered planning and durable replay service | `src/features/presentations/server/suggestion-service.ts` |
| Owned request/source/apply actions | `src/features/presentations/server/suggestion-actions.ts` |
| Shared review/source-library UI | `src/features/presentations/components/SuggestionReview.tsx` |
| Reused manual editor, project preference and Undo integration | `PresentationPanel.tsx`, `VisualSettingsPanel.tsx`, `useScenePresentations.ts`, Timeline Editor, Scene Board |
| Isolated regression/SQL/server/service fixtures | `tests/presentations/phase-3*.test.mjs` |
| Actual isolated UI/Player runner | `scripts/presentations/check-phase-3-ui.mjs` |

The coding-standards skill informed immutable contracts and the separation of pure selection rules, provider I/O, owned persistence and shared UI. Billing's existing changes were preserved, not refactored for this module; no dependencies or environment files were changed.

## Local verification

| Check | Result |
|---|---|
| Presentation suite | **63 tests passed**, including all 50 Phase 0–2 regressions and 13 new Phase 3 test groups. |
| Billing dependency regression | **159 tests passed**; no live Stripe/provider activity. |
| Real Phase 3 SQL in isolated PGlite | Applied twice; source/RLS ownership, protected direct writes, private CAS core, source snapshots, stale script/media checks, lock/manual permission, multi-scene application, retry identity, draft edits and origin restoration verified. Not a live Supabase deployment. |
| Actual action/context logic with I/O stubbed | Owned read/source approval, activation/billing failure, stored choice authority, rejected forged inputs, safe conflict messages and explicit edited drafts verified. Not a real signed-in end-to-end session. |
| Shared planning with real metering policy and fixture repository/provider | Two bounded windows for ten scenes, full negation retained, reordered model responses keyed by scene, conservative server-derived budgets, ready replay and uncertain/bad response protection verified. No real model inference. |
| Actual review/editor/Player/CSS browser fixture | **10 workflow groups passed**, zero unexpected errors: ready/default protection, selection toggles, explicit manual permission, editable preview/review checkbox, partial batch outcomes, stable apply/request identities, stale restored suggestions, source approval, mobile and Escape. Persistence is simulated. |
| Existing Phase 2 manual UI regression | **15 workflow groups passed**, zero unexpected errors. All nine added family editors plus the existing comparison path remain available. |
| Typecheck and production build | Passed. |
| Focused lint | Zero errors; the existing native-image region editor still has one `no-img-element` warning. Whole-repository lint is not claimed clean. |

Local ignored artifacts:

- `out/presentations-phase-3/acceptance-ui/`: ten-group report and mobile review screenshot.
- `out/presentations-phase-2/phase-3-regression/`: manual-library regression report/screenshot.

No Remotion family renderer changed in Phase 3. The Phase 2 render matrix remains the previous rendering evidence; this phase additionally exercised the actual reused Player/editor. A new 180-frame matrix, cloud output or live AI suitability score is not claimed.

Repeat with unused artifact labels:

```powershell
node --test tests/presentations/*.test.mjs
node --test tests/billing/*.test.mjs
npm run typecheck
npm run build
npx eslint --no-ignore src/lib/presentations/suggestions.ts src/lib/ai/agents/presentation-director.ts src/features/presentations tests/presentations/phase-3* scripts/presentations/check-phase-3-ui.mjs
node scripts/presentations/check-phase-3-ui.mjs review-ui-new
node scripts/presentations/check-phase-2-ui.mjs manual-regression-new
```

The Windows isolated UI runners required approved execution outside the sandbox for esbuild/browser access. They did not access customer data, purchase generations or deploy anything.

## Human suitability evaluation and release checklist

Prepare actual approved project source packets and a versioned reviewed scene set. For each scene, record acceptable family/source IDs and denied interpretations; multiple choices may be good. Evaluate these cases before enabling wider access:

| Case | Review criterion |
|---|---|
| Enoch supplied passage/translation | Exact supplied original, edition, reading and crop retained; no fabricated scholarly interpretation. |
| Mesopotamia map/artifact/detail | Actual source identity and reviewed location/region are appropriate; modern map is not framed as ancient borders. |
| Negated extraordinary claim | Selection and reason do not turn “not proof” into an affirming visual. |
| Missing evidence or background | Clear non-ready requirement/clean fallback; no fabricated asset/source. |
| Short or dense scene | No forced graphics; timing and actual font/caption fit reviewed. |
| Repeated neighboring families | Appropriate continuity or breathing room, not a quota-driven substitution. |
| Locked/manual scene | No unauthorized replacement; explicit scope and locks preserved. |
| Changed script/source/narration | Old result rejected without losing saved edits. |
| Interrupted/partial act | Durable identity and per-scene outcomes are honest; reconciliation does not duplicate vendor work. |

Score explanatory fit, source fidelity, identity, readability/timing, sequence pacing, channel constraints and preservation of user control. Report rates and concrete failure examples, not model confidence. No real provider output was generated/scored during this task.

Before hosted release:

1. Choose the staging environment, retain the Phase 0 inventory and a recoverable backup; review/apply migration prerequisites through Phase 3 in order.
2. Establish a real Supabase owner session. The development proxy bypass remains insufficient and must not replace authentication/RLS.
3. Approve billing catalog, token-cap/settlement policy and reconciliation procedure; configure credentials without exposing them and deliberately enable the presentation flag only after those checks.
4. Verify actual provider output/refusal/timeout, host request duration and interrupted-run recovery with bounded staged requests.
5. Run the real creator workflow in both editors: source approval, single/act suggestion, alternatives, edits, selective Apply, concurrent locks/scripts/sources, reload, immediate Undo and independent legacy overlays.
6. Review the actual Enoch/Mesopotamia scene set using the rubric above. None of those historical assets/translations have been approved by this task.
7. Verify preview/local/deployed v2 Lambda output with real owned media, caption layout, fonts and source credits. No additional paid render was made here.

**Local Phase 3 implementation is complete; first-release activation and human suitability acceptance remain open.** Phase 4/5 catalog expansion has not started.
