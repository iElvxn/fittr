- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-sign-in-and-sign-out.md`
  summary: Build password reset via email on the sign-in screen.
  evidence: epic-1-context.md's UX flow explicitly calls for "sign up/sign in with email (password reset via email)", but neither Story 1.1 (email sign-up) nor Story 1.2 (email sign-in) implemented it. Pre-existing gap predating this story, not caused by its diff.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-sign-in-and-sign-out.md`
  summary: A new user who backgrounds/relaunches mid-onboarding lands on Home instead of resuming onboarding, since there's no persisted onboarding-completion flag.
  evidence: Already documented and accepted as a residual risk in spec-1-2's Design Notes. Its only real fix (a persisted "onboarding complete" flag) is directly excluded by spec-1-2's frozen Never boundary and belongs to Story 1.3 (profile setup).

- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-sign-in-and-sign-out.md`
  summary: Add a render test for app/index.tsx's cold-start redirect (existing session -> /(tabs)/index vs. no session -> /(auth)/welcome).
  evidence: Verification-gap finding: no test renders or imports app/index.tsx, so a reverted or altered redirect target would ship undetected. Lower risk than the welcome.tsx/sign-in.tsx/profile.tsx gaps (single conditional, no branch logic) — reviewer's own suggested disposition was defer rather than patch.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-set-up-and-edit-profile.md`
  summary: A new user who backgrounds/relaunches mid-onboarding lands on Home instead of resuming onboarding — derive "incomplete" from the placeholder display name and redirect app/index.tsx to /onboarding accordingly.
  evidence: Not one of Story 1.3's actual acceptance criteria in epics.md (display name required, avatar upload, profile view/edit) despite being related and previously deferred here from spec-1-2 to "Story 1.3". Split out at token-budget time to keep spec-1-3 scoped to its literal ACs; still worth doing as its own small, self-contained follow-up.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-set-up-and-edit-profile.md`
  summary: No way to remove a previously-set avatar and revert to having none.
  evidence: Review finding (blind-hunter): not required by any of Story 1.3's ACs, and the frozen `Never` boundary explicitly forbids a Storage DELETE policy — a clean removal feature would need one (or a distinct null-avatar sentinel), which is a real design decision beyond this story's scope.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-sign-up-for-an-account.md`
  summary: Email sign-up never checks whether Supabase actually returned a session (it only checks `data.user`), so with "Confirm email" on (the project's deliberate setting), a brand-new email/password account has no session and silently can't do anything on the next screen — no error, no "check your email" messaging, just a dead Continue button on onboarding.
  evidence: Found during live device testing of Story 1.3's onboarding screen: `email-sign-up.tsx` unconditionally routes to `/onboarding` after `signUpWithEmail` resolves, and `handleContinue`'s `if (!userId) return;` guard silently no-ops with no session. Root cause is in Story 1.1's sign-up flow, not Story 1.3.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-browse-and-filter-the-wardrobe.md`
  summary: Add a repo-wide convention (and initial coverage) for testing `Sentry.captureException` calls -- no test anywhere in the codebase currently mocks `@/lib/observability/sentry` or asserts these calls fire/don't fire.
  evidence: Verification-gap finding on this story's new `Sentry.captureException(error)` call in `app/(tabs)/wardrobe.tsx` for unknown wardrobe-load errors: untested, and a regression removing or inverting it would ship undetected. The identical gap already exists for the two pre-existing `Sentry.captureException` calls in `app/add-item.tsx` (Story 2.1), so fixing it only here would be an inconsistent, one-off convention rather than closing the actual gap.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-batch-add-items-via-library-multi-select-or-rapid-camera.md`
  summary: No automated screen-level test exists for `app/add-item.tsx` or `components/wardrobe/CameraFilmstrip.tsx`, so `handleSaveAll`'s readiness guard, `handleShutterPress`'s re-entrancy/error handling, source-dependent `handleRetake` branching, and the `batchSize`-carrying `trackItemAdded` analytics loop are all verified only by manual on-device testing.
  evidence: Verification-gap and blind-hunter findings, same root cause: this repo has no established pattern for testing screens with heavy native-module entanglement (`ActionSheetIOS`, `CameraView`, `ImagePicker`) -- Story 2.1's `app/add-item.tsx` set this precedent (two real bugs there were only ever caught by manual device testing, per its own Review Triage Log). Closing this properly would mean either extracting the screen's pure orchestration logic into testable helpers, or building a component-interaction test harness for this class of screen -- both bigger than a single story's scope.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-view-edit-and-delete-an-item.md`
  summary: No length limit on wardrobe item name/brand/notes anywhere in the app (add-item's identical fields have never had one either); Story 2.4's item-detail redesign shows the name as a large Cormorant headline, making an extreme-length name cosmetically worse than elsewhere.
  evidence: Blind-hunter finding. The missing validation is pre-existing across the whole wardrobe item data model (Story 2.1 onward), not introduced by this story's diff -- fixing it here alone would mean inventing an arbitrary character cap unilaterally rather than deciding one consistently for the whole model.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-view-edit-and-delete-an-item.md`
  summary: Soft-deleted wardrobe items (and their `cutout.png`/`thumb.webp` Storage objects) are never actually purged -- rows and files accumulate forever once `deleted_at` is set.
  evidence: Discussed post-implementation. Not worth building now: a scheduled reaper job is real infra (cron, testing, monitoring) disproportionate to this app's current scale, and industry practice for small/indie apps is to skip it until storage cost or user volume actually justifies it -- a manual one-off cleanup script is enough if/when that day comes. The one exception is Epic 6's "Delete Account" flow, which needs a real hard-delete for privacy reasons regardless of this decision and should not be skipped.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-build-a-fit-on-the-canvas.md`
  summary: Undo/redo for canvas edits (item moves, adds, removes) during a Fit-building session.
  evidence: Surfaced from user-provided UI inspiration during Story 3.1 planning; not in Epic 3's requirements or Story 3.1's acceptance criteria, which only specify drag/pinch/rotate/reorder. Would need session-history state design beyond this story's scope.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-build-a-fit-on-the-canvas.md`
  summary: Per-item duplicate and horizontal-flip (mirror) actions on the fit canvas.
  evidence: Surfaced from the same UI inspiration. Not required by any Epic 3 story; duplicate would need a placement/offset rule and flip would need a rendering-level mirror, neither specified anywhere in planning artifacts.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-build-a-fit-on-the-canvas.md`
  summary: A background picker for the fit canvas (custom canvas background beyond the default surface).
  evidence: Surfaced from the same UI inspiration. No planning artifact mentions customizable canvas backgrounds; would need new storage/rendering support in the collage-save path (Story 3.2) at minimum.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-build-a-fit-on-the-canvas.md`
  summary: The fit-builder's category tray can flash "No items in this category" during the initial wardrobe-items fetch, indistinguishable from a genuinely empty category.
  evidence: Code-review finding (blind-hunter, edge-case-hunter). Real but narrow: the tray reuses the same TanStack Query key as the Wardrobe tab, so cache is normally warm by the time a user reaches this screen; only a cold-start (first-ever fetch) edge case. Fix needs a new loading prop/branch threaded through `app/new-fit.tsx` -> `CategoryTray`, more than a direct correction.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-build-a-fit-on-the-canvas.md`
  summary: No PostHog analytics events fire anywhere in the new Fit-builder flow (template pick, skip, item add), unlike `add-item.tsx`'s `trackItemAdded` precedent.
  evidence: Code-review finding (blind-hunter). No AC or planning artifact requires Fit-builder analytics; a real scope decision (what events, what properties) for product/analytics ownership to make, not a defect in this story.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-build-a-fit-on-the-canvas.md`
  summary: Story 2.4's "Create Fit With This" item-detail action (noted as an entry point into Story 3.1 in `epic-3-context.md`'s Cross-Story Dependencies) has no wiring into `app/new-fit.tsx` -- no route params exist to prefill a preselected wardrobe item.
  evidence: Code-review finding (blind-hunter). Verified: `new-fit.tsx` accepts no params. This story's human-approved frozen Intent scopes entry to the Fits-tab flow only and never mentions item-detail prefill, so it's out of this story's approved scope, not a defect -- needs its own follow-up story/task.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-build-a-fit-on-the-canvas.md`
  summary: `CategoryTray`'s empty-category state ("No items in this category.") is a dead end with no call-to-action into the add-item flow, even though the user is actively mid-flow and may own no items in that category.
  evidence: Code-review finding (blind-hunter). Real UX rough edge, not required by any Story 3.1 acceptance criterion.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-build-a-fit-on-the-canvas.md`
  summary: A newly-added canvas item can render invisible-but-interactive (full hit area, no image) for a brief window while its signed cutout URL is still resolving.
  evidence: Code-review finding (edge-case-hunter). Real but narrow timing window that self-corrects on the next render once the bulk signed-URL query resolves; fix needs a new loading-placeholder branch in `CanvasItem`, more than a direct correction.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-build-a-fit-on-the-canvas.md`
  summary: No test exercises `app/new-fit.tsx`'s unmount-triggered `reset()` -- the sole mechanism implementing "discard the canvas on navigate away" (no persistence exists yet in Story 3.1).
  evidence: Code-review finding (verification-gap). Real regression-detection gap, but no route-lifecycle unmount test exists anywhere in this repo for any screen, including `app/add-item.tsx` (the template this story's route mirrors) -- establishing that test pattern is bigger than this one story.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-preview-name-and-save-a-fit.md`
  summary: `fit_items.item_id` (FK to `wardrobe_items`, `on delete cascade`) has no index, unlike `fit_id`; a lookup by `item_id` will full-scan.
  evidence: Code-review finding (blind-hunter). No query in Story 3.2's diff looks up `fit_items` by `item_id` -- Story 3.4 ("Fit behavior when a wardrobe item is deleted") is the actual consumer of that access path and should add the index alongside the code that needs it.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-preview-name-and-save-a-fit.md`
  summary: `lib/fits/saveFit.ts`'s rollback helpers swallow their own Storage/DB errors via `.catch(() => {})` with no Sentry logging, so a failed rollback (orphaned Storage object or stuck soft-delete) is undetectable.
  evidence: Code-review finding (edge-case-hunter). Verified this is the exact pattern already shipped in `lib/wardrobe/addItem.ts`'s own rollback calls (`uploadItem`, `saveBatch`), which this story's spec explicitly required mirroring -- not introduced by this story, and fixing it here alone would leave `addItem.ts` inconsistent. Needs a follow-up covering both files together.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-edit-and-delete-a-fit.md`
  summary: A saved placement whose wardrobe item was deleted seeds onto the edit canvas as a silent `'top'`-category fallback with no visible indication anything is missing.
  evidence: Code-review finding (blind-hunter). Real today (deleting a wardrobe item is already possible, not gated on Story 3.4), but epics.md's own Story 3.4 ("Fit behavior when a wardrobe item is deleted") explicitly owns showing a visible gap at the deleted item's canvas position -- that story's own acceptance criterion, not this one's.
