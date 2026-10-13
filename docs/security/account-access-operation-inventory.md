# Account access operation inventory

Date: October 13, 2026. Local code inventory for Plan 29 Phases 0–10. Remote grants, deployed workers, and additional exposed schemas must be inventoried separately. See [the continuation guide](account-access-phases-3-6-setup.md), [Phase 7](account-access-phase-7-setup.md), and [Phases 8–10](account-access-phases-8-10-setup.md).

83 legacy exported actions remain closed. Seven legacy handlers remain closed; eighteen owned metadata/private-media/onboarding/job/billing handlers and three Stripe handlers have separately reviewed gates. All optional capabilities remain disabled by default. The approved billing catalog is empty; sales and paid providers remain disabled. No remote side-effect probe was run.

## Exported Server Actions

| File | Exports | Boundary |
|---|---|---|
| src/features/audio/server/audio-actions.ts | generateSceneAudio, generateActNarration, recomputeActLayout, getActNarrations, generateFullNarration, getAvailableVoices | Closed; throws before legacy work |
| src/features/auth/server/actions.ts | login, signup, resendConfirmation, logout | Auth/recovery flags, validation, trusted Origin; verified session for account changes |
| src/features/auth/server/recovery-actions.ts | forgotPassword, resetPassword, changePassword, changeEmail | Auth/recovery flags, validation, trusted Origin; verified session for account changes |
| src/features/channel-settings/server/fact-actions.ts | getChannelFacts, addExtractedFacts, upsertChannelFact, deleteChannelFact, setFactsVerified, resolveProjectFactLedger | Closed; throws before legacy work |
| src/features/channel-settings/server/format-actions.ts | getWorkspaceFormatProfile, saveWorkspaceFormatProfile, resolveProjectFormatProfile, getProjectFormatProfile, consumeRotationCursor, resolveProjectFramingDevice, readActContinuity, recordActContinuity, generateFormatFromBrief | Closed; throws before legacy work |
| src/features/presentations/server/actions.ts | saveScenePresentation | Closed; throws before legacy work |
| src/features/presentations/server/context.ts | loadPresentationContext, getPresentationVisualSettings, savePresentationVisualSettings | Closed; throws before legacy work |
| src/features/presentations/server/suggestion-actions.ts | getPresentationSuggestionWorkspace, savePresentationEvidence, removePresentationEvidence, suggestPresentations, applyPresentationSuggestion | Closed; throws before legacy work |
| src/features/scene-board/server/scene-board-actions.ts | loadSceneBoard | Closed; throws before legacy work |
| src/features/thumbnails/server/thumbnail-actions.ts | listThumbnails, generateConceptThumbnails, generateFinalThumbnails, regenerateThumbnail, selectThumbnail, deleteThumbnail | Closed; throws before legacy work |
| src/features/timeline-editor/server/combo-actions.ts | applyComboToScene, autoDirectSingleSceneAction | Closed; throws before legacy work |
| src/features/timeline-editor/server/media-actions.ts | createMediaRecord, updateMediaStatus, getOrCreatePresetMedia, deleteMediaRecord | Closed; throws before legacy work |
| src/features/timeline-editor/server/overlay-clip-actions.ts | createOverlayClip, updateOverlayClip, deleteOverlayClip | Closed; throws before legacy work |
| src/features/timeline-editor/server/scene-actions.ts | updateScene, clearSceneVisuals, deleteScenes, reorderScenes, createSceneWithMedia | Closed; throws before legacy work |
| src/features/timeline-editor/server/timeline-actions.ts | createTimelineItem, updateTimelineItem, deleteTimelineItem | Closed; throws before legacy work |
| src/features/video-generation/server/orchestrator-actions.ts | enrichAndPersistScenes | Closed; throws before legacy work |
| src/features/video-generation/server/slicer-actions.ts | sliceScriptIntoScenes | Closed; throws before legacy work |
| src/features/video-generation/server/whiteboard-actions.ts | createProjectWithActs, generateAct, rewriteActWithAI, finalizeProjectScript, updateSceneVoiceover, replaceActScenes, regenerateActVisuals, regenerateActNarration, castProjectCharactersOnce, approveActVisuals, approveAndGenerateVisuals | Closed; throws before legacy work |
| src/features/videos/server/video-actions.ts | createAndGenerateVideo, updateProjectTrackStates, updateProjectStatus, updateProjectExportUrl, updateProjectCaptionsEnabled, updateProjectDefaultGenerationMode, updateProjectTopic, deleteVideoProject | Closed; throws before legacy work |
| src/features/workspaces/server/owned-workspace-actions.ts | createWorkspace | Owned-content flag, trusted Origin, strict payload, verified identity/profile, owner-derived RPC and shared limits |
| src/features/workspaces/server/workspace-actions.ts | getWorkspaceChannelSettings, saveWorkspaceChannelSettings | Closed; throws before legacy work |
| src/lib/ai/elevenlabs.ts | generateSceneSpeech | Closed; throws before legacy work |
| src/lib/ai/local-tts.ts | generateLocalSceneSpeech | Closed; throws before legacy work |
| src/lib/ai/openai-tts.ts | generateOpenAISceneSpeech | Closed; throws before legacy work |
| src/lib/ai/script-writer.ts | generateScript, generateArcAndHook, generateActOutlines | Closed; throws before legacy work |

## API handlers

| File | Methods | Boundary |
|---|---|---|
| src/app/api/account/projects/route.ts | GET | Owned-content flag, verified profile and ownership; bounded validated writes/shared limits |
| src/app/api/account/resources/route.ts | PATCH | Owned-content flag, verified profile and ownership; bounded validated writes/shared limits |
| src/app/api/account/workspaces/route.ts | GET, POST | Owned-content flag, verified profile and ownership; bounded validated writes/shared limits |
| src/app/api/ai/brainstorm/route.ts | POST | Closed; 503 before legacy work |
| src/app/api/ai/generate-script/route.ts | POST | Closed; 503 before legacy work |
| src/app/api/auth/navigation/route.ts | GET | Minimal verified navigation state; private/no-store |
| src/app/api/leads/route.ts | POST | Off by default; trusted Origin, bounded payload, durable private RPC; optional server secret |
| src/app/api/media/from-url/route.ts | POST | Private-media flag, verified ownership/state; bounded persistence/signing, no filesystem selection |
| src/app/api/media/generate/route.ts | POST | Closed; 503 before legacy work |
| src/app/api/media/upload/route.ts | POST | Private-media flag, verified ownership/state; bounded persistence/signing, no filesystem selection |
| src/app/api/media/[mediaId]/content/route.ts | GET | Private-media flag, verified ownership/state; bounded persistence/signing, no filesystem selection |
| src/app/api/media/[mediaId]/status/route.ts | GET | Private-media flag, verified ownership/state; bounded persistence/signing, no filesystem selection |
| src/app/api/render/download/route.ts | GET | Private-media flag, verified ownership/state; bounded persistence/signing, no filesystem selection |
| src/app/api/render-remotion/route.ts | GET, POST | Closed; 503 before legacy work |
| src/app/api/stock-media/route.ts | GET | Closed; 503 before legacy work |
| src/app/api/stripe/checkout/route.ts | POST | Sandbox launch, approved catalog/sales flag, Origin, confirmed identity/profile/limits, existing bounded checkout service |
| src/app/api/stripe/portal/route.ts | POST | Independent sandbox portal flag; verified owner and mapped customer, safe redirect |
| src/app/api/stripe/webhook/route.ts | POST | Independent sandbox webhook flag; original bounded bytes, signature/mode/API version, durable receipts and fenced authoritative sync |
| src/app/api/sync-timeline-assets/route.ts | POST | Closed; 503 before legacy work |

## Other entry points

- `/api/account/billing` GET, `/enroll` POST, `/invoices` GET: sandbox launch gates; confirmed actor/profile and trusted mapping. Enrollment derives identity; invoice provider reads are separately enabled/rate limited. Public summaries contain no customer IDs/secrets.
- `/api/account/jobs` GET/POST and `/[jobId]` GET/DELETE: durable/owned flags, verified current ownership, bounded UUID/input commands and mutation Origin. SQL reserve/enqueue is atomic; only unsent work is cancelable. Paid script/render checks are independent of mock testing.
- Secured worker/dispatch/billing recovery tasks under `src/trigger/account-access`: backend SDK authority, service-only claims, immutable inputs, verified resources and current allowances; no request cookies or local renderer. Global/specific kill switches guard new paid work. Accepted cloud handles can be polled without re-submission.
- `run:local-mock`: localhost-only operator CLI; requires a saved mock job and forcibly disables paid lanes in its own process. It is not a browser auth bypass and is not automatically run.

- `/api/account/onboarding` GET/POST: owned-content and onboarding flags; verified confirmed actor/profile; private no-store response; strict origin and bounded command on POST. Saved state is actor-scoped. Save and complete use SQL revision/idempotency/ownership guards and shared durable limits, creating metadata only.
- `/onboarding` and `/account/projects/[projectId]`: confirmed identity plus server capability/resource checks. No legacy dashboard activation or provider work. Account routing resumes incomplete setup and offers an explicit account overview escape.

- `src/trigger/autopilot.ts`: worker run rejects before reading/querying/submitting work. Existing external deployments require independent disable/redeployment.
- Auth callbacks: `/auth/callback` accepts only email confirmation; `/auth/recovery` only recovery and creates a signed session-bound proof; `/auth/email-change` only the provider confirmation type. All use the configured origin and fixed safe redirects.
- Dashboard/server pages: server guards redirect before legacy queries; private generated static assets and image-optimizer access remain blocked.
- User-scoped SQL: only minimal profile reads, owned resource reads, validated workspace/rename/reservation/limit RPCs. Browser credits/owner writes and storage access stay denied. Media finalization is service-role-only after storage verification.
- Libraries are not independent browser entry points. The private-media service independently repeats ownership/state/key checks before its privileged storage adapter.

The executable `tests/auth/boundaries.test.mjs` checks every legacy action/handler and known owned handler. Security behavior tests cover the actual guards, SQL, recovery proof, bounded streams and storage rejection/retry. New endpoints must update the reviewed inventory and tests rather than inherit access implicitly.
