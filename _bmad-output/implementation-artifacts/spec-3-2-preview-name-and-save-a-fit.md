---
title: 'Preview, Name, and Save a Fit'
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '7dec6e3ad3b66d4836420f720bd84ed46bd75abc'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.1 built the freeform canvas, but everything is discarded on exit — there is no way to turn an arrangement into a reusable Fit.

**Approach:** Add a Save action that renders the current canvas as a collage image (`react-native-view-shot`), lets the user name it (or accept a generated default like "Fit 12"), and persists the Fit plus each item's placement (`x, y, scale, rotation, z_index`) to new `fits`/`fit_items` tables and Supabase Storage.

## Boundaries & Constraints

**Always:** Mirror `lib/wardrobe/addItem.ts`'s upload-then-insert/rollback/no-connection shape for the new save flow; `fits`/`fit_items` get explicit per-operation RLS policies scoped to `user_id = (select auth.uid())`, no client-side DELETE policy (soft delete only via `deleted_at`), mirroring `supabase/migrations/0003_wardrobe_items.sql`; collage uploads to `wardrobe/{user_id}/fits/{fit_id}/cover.png`; the Fit `id` is a client-generated uuid so the Storage path can be derived before the insert (same reasoning as `wardrobe_items.id`); `fit_items` has its own client-generated uuid primary key (reusing the canvas placement's own `id`), not the composite `(fit_id, item_id)` key from `data-model.md`, plus a plain index on `fit_id` — a deliberate, human-approved deviation from that doc, since Story 3.1's `CatalogSheet` lets the same wardrobe item be placed on canvas more than once and a composite key can't represent that; Save is the screen's one primary-accent action; a no-connection failure is block-and-keep — "No connection — nothing was lost. Try again." — with the name and canvas intact and a retry action; success microcopy is "Fit saved." (no exclamation marks/emoji, per `EXPERIENCE.md`'s tone rule); write the RLS cross-user isolation test for `fits`/`fit_items` mirroring `supabase/tests/rls.test.ts`'s existing `wardrobe_items` block; unit tests are written before the implementation they cover.

**Never:** No edit-existing-Fit flow (Story 3.3); no changes to `app/(tabs)/fits.tsx`'s grid (Epic 4 — this story only needs the insert to be correct, not a grid to render it); no share/export of the collage; no offline queueing/local-first persistence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tap Save with items on canvas | `items.length > 0` | Canvas renders to an image via view-shot; a Save sheet opens showing the collage and a name field pre-filled with a generated default ("Fit {n}") | N/A |
| Save affordance with an empty canvas | `items.length === 0` | Save is disabled — nothing to render or persist | N/A |
| Confirm without editing the name | Default name untouched | Fit saved with that generated default name | N/A |
| Confirm with a custom name | User edits the name field | Fit saved with the trimmed custom name; a blank/whitespace-only edit falls back to the generated default | N/A |
| Successful save | Valid network | One `fits` row + one `fit_items` row per placed item inserted; `cover.png` uploaded; builder store resets; screen dismisses to the Fits tab | N/A |
| No connection during save | Upload or insert fails on connectivity | Sheet stays open, name and canvas untouched, shows "No connection — nothing was lost. Try again." with a retry action | Block-and-keep; any partially-committed row/object from this attempt is rolled back before returning |
| Same wardrobe item placed on canvas twice | Two `PlacedItem`s share one `wardrobeItemId` (`CatalogSheet` does not prevent this today) | Both placements persist as two distinct `fit_items` rows, each with its own id | N/A |

</frozen-after-approval>

## Code Map

- `stores/fitBuilder.ts` -- canvas state only (`items`, `templateId`, `canvasBackgroundColor`); no changes needed here. Fit name / collage URI / saving-and-error state live as local `useState` in `app/new-fit.tsx` instead, mirroring `app/add-item.tsx`'s `submitting`/`connectionError`/`fieldError` pattern rather than growing the store's scope.
- `app/new-fit.tsx` -- add a floating "Save" pill (top-right, mirroring the existing Cancel circle at top-left, lines 134-151), enabled only when `items.length > 0`; wraps `FitCanvas`'s card in a `react-native-view-shot` `captureRef`; on tap, captures the collage, fetches the generated default name, and opens `SaveFitSheet`; on the sheet's successful save, calls `reset()` then `router.dismissTo('/(tabs)/fits')`.
- `components/fitBuilder/FitCanvas.tsx` -- wrap the canvas card `View` (line 109) in a `forwardRef` so `new-fit.tsx`'s `captureRef` targets exactly the canvas, not the whole screen/footer.
- `components/fitBuilder/SaveFitSheet.tsx` (new) -- bottom sheet, same `Modal`/backdrop/drag-handle chrome as `CanvasBackgroundSheet.tsx` (lines 66-80); shows the captured collage `Image`, a `TextInput` styled like `app/item/[id].tsx`'s name field (lines 230-251), `ConnectionErrorNotice` on failure, and a primary `Button` ("Save", `loading` bound to the in-flight save).
- `lib/fits/saveFit.ts` (new) -- mirrors `lib/wardrobe/addItem.ts` exactly: `uploadCover(userId, fitId, collageUri)` uploads to `wardrobe/{userId}/fits/{fitId}/cover.png` with `upsert: true`, rolling back the upload on a later insert failure; `insertFit(userId, fitId, name, items)` upserts the `fits` row then the `fit_items` rows (array insert, `onConflict: 'id'` on each placement's own client-generated id).
- `lib/fits/errors.ts` (new) -- `FitError` class + `NO_CONNECTION_MESSAGE`/`UNKNOWN_ERROR_MESSAGE`, mirroring `lib/wardrobe/errors.ts` rather than overloading `WardrobeItemError` across domains.
- `lib/fits/nextFitName.ts` (new) -- `getNextFitName(userId)`: counts the user's non-deleted `fits` rows, returns `` `Fit ${count + 1}` ``.
- `supabase/migrations/0004_fits.sql` (new) -- `fits` + `fit_items` tables, RLS, indexes, `updated_at` trigger (reusing `public.set_updated_at()`), mirroring `0003_wardrobe_items.sql`'s structure and comments; `fit_items` gets its own uuid primary key (not the composite key in `data-model.md`) plus an index on `fit_id`, with a comment documenting the deviation and why.
- `supabase/tests/rls.test.ts` -- add a `fits`/`fit_items RLS: cross-user isolation` `describe` block mirroring the existing `wardrobe_items RLS` block (lines 185+).
- `components/ui/icons/CheckIcon.tsx` (new) -- thin-stroke check mark, same family/weight as `CloseIcon.tsx`.
- `package.json` -- add `react-native-view-shot`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/0004_fits.sql` -- create `fits`/`fit_items` with RLS, indexes, trigger -- schema everything else depends on.
- [x] `__tests__/nextFitName.test.ts` + `lib/fits/nextFitName.ts` -- default-name generation, written first.
- [x] `__tests__/saveFit.test.ts` + `lib/fits/errors.ts` + `lib/fits/saveFit.ts` -- upload/insert/rollback/no-connection coverage per the I/O matrix, written before the sheet consumes it.
- [x] `components/ui/icons/CheckIcon.tsx` -- Save affordance icon.
- [x] `__tests__/saveFitSheet.test.tsx` + `components/fitBuilder/SaveFitSheet.tsx` -- prefilled/edited name, Save calls `saveFit`, failure shows `ConnectionErrorNotice` and keeps state intact.
- [x] `components/fitBuilder/FitCanvas.tsx` -- `forwardRef` for view-shot capture.
- [x] `app/new-fit.tsx` -- wire the Save pill, capture, sheet, and post-save reset/dismiss.
- [x] `supabase/tests/rls.test.ts` -- cross-user isolation coverage for `fits`/`fit_items`.
- [x] `__tests__/newFit.test.tsx` -- full-screen orchestration coverage (Save disabled/enabled, capture+default-name fetch, success reset+dismiss, no-connection block-and-keep) added during the Matrix Test Audit to close I/O-matrix rows the unit tests alone didn't reach.

**Acceptance Criteria:**
- Given items arranged on the canvas, when I tap Save, then I see a rendered collage of the current arrangement.
- Given the Save sheet, when I confirm, then the Fit is named (typed or generated default) and each item's `x, y, scale, rotation, z_index` persists to `fits`/`fit_items`, with the collage stored as `cover_path`.
- Given a successful save, when it completes, then the builder resets and I land back on the Fits tab.

## Implementation Notes

- Implemented directly in this session (task-by-task, tests before code), per the human's explicit request to review each file as it landed with the reasoning explained -- same working style as Story 3.1.
- `fit_items`' primary key and column set deviate from `_bmad-output/specs/spec-phase-1/data-model.md` (own `id` PK instead of composite `(fit_id, item_id)`; no `user_id`/`deleted_at`) -- both decided with the human during planning (Open Questions) and documented in `0004_fits.sql`'s own header comment.
- `saveFit.ts`'s rollback for an orphaned `fits` row (when the later `fit_items` upsert fails) uses a soft-delete `UPDATE deleted_at`, not `.delete()` -- `fits` has no DELETE RLS policy by design, and a `.delete()` there would silently no-op under real RLS rather than erroring. Caught this by contrast with `lib/wardrobe/addItem.ts`'s own rollback, which does call `.delete()` on `wardrobe_items` (a table that also has no DELETE policy) -- an existing latent no-op in that file, not something copied here.
- `SaveFitSheet`'s primary `Button` gets an explicit `accessibilityLabel="Save"` -- `Button`'s loading state swaps its text for a bare `ActivityIndicator` with no accessible name otherwise, a small real accessibility gap surfaced while writing `saveFitSheet.test.tsx`.
- `app/new-fit.tsx`'s Save pill reuses the existing `Button` component (primary variant, `leftIcon`) in a floating top-right container, rather than a bespoke pill -- keeps the "one primary-accent element per screen" rule and avoids introducing a new button style.
- `fitId` (and each placement's own `id`) are minted once when Save is first tapped and held in `pendingSave` state across a retry, so a no-connection retry's `uploadCover`/`insertFit` calls upsert the same rows instead of creating duplicates.
- `getNextFitName`'s fetch is best-effort inside `handleSavePress`: a failure there (e.g. no connection) falls back to a bare `'Fit'` default rather than blocking the sheet from opening, since the user can still type their own name -- the spec's actual no-connection UX applies to the real save (`handleConfirmSave`), not this cosmetic default.
- One simplification from the frozen I/O matrix: `handleConfirmSave` shows the same block-and-keep "No connection" UI for *any* save failure, not only ones classified as `FitError('no_connection')` -- `SaveFitSheet` only has the one error affordance, and a genuinely unexpected failure still gets logged via `Sentry.captureException` for visibility. Flagged to the human rather than silently expanding `SaveFitSheet`'s API with an unplanned second error state.
- Matrix Test Audit (run per the workflow's own gate) found four I/O-matrix rows (Save-tap capture/open, disabled-when-empty, success reset+dismiss, no-connection wiring) that the unit/component tests didn't reach, since they live in `app/new-fit.tsx`'s own orchestration. Added `__tests__/newFit.test.tsx` to close them, plus one more `saveFit.test.ts` case for the duplicate-wardrobe-item-placement row.
- Debugging `newFit.test.tsx` took a real detour: state updates appeared to vanish after an async Save tap. Root cause was self-inflicted -- an exploratory `jest.mock('react-native/Libraries/Modal/Modal', ...)` added mid-debugging crashed NativeWind's CSS-interop wrapper on render (`Cannot read properties of undefined (reading 'displayName')`), and that render-time throw was being silently swallowed by the test's async/`act()` sequencing instead of surfacing. Removing that mock (the real `Modal` renders fine) and sequencing item placement through the store's real `addItem` action inside `await act(async () => {...})` fixed all four tests with no production-code changes needed.
- Migration not yet applied to the live Supabase project -- see Verification.
- Review pass 1 fixes (see Review Triage Log for full findings and routing): `insertFit`'s `fits` upsert now explicitly sends `deleted_at: null` so a retry after an earlier `fit_items`-failure rollback actually un-deletes the row, with a new regression test covering fail-then-retry; `SaveFitSheet`'s backdrop tap and Android back are now no-ops while `saving`; the frozen spec's "Fit saved." success microcopy now shows via a `fitSaved=1` dismiss param on the Fits tab, mirroring `wardrobe.tsx`'s existing `itemAdded` ack precedent exactly; a `captureRef` failure now shows `UNKNOWN_ERROR_MESSAGE` inline on the canvas instead of failing silently -- this also gave `UNKNOWN_ERROR_MESSAGE` a real consumer, so triage finding #6 (dead export) was resolved by wiring it up rather than deleting it, a small deviation from that finding's literal routed fix; added the missing `fit_items` UPDATE cross-user isolation test alongside its existing SELECT/INSERT/DELETE coverage; documented `is_favorite`'s Epic 4 reservation in `0004_fits.sql`'s table comment.

## Spec Change Log

## Review Triage Log

Review pass 1 (blind-hunter, edge-case-hunter, verification-gap, run in parallel against the full diff):

1. `lib/fits/saveFit.ts` `insertFit` -- the `fits` upsert payload (`{ id, user_id, name, cover_path }`) never sends `deleted_at`, so a retry after `rollbackOrphanedFit` soft-deleted the row (on an earlier `fit_items` failure) leaves `deleted_at` stuck even once the retry fully succeeds (verification-gap, independently found by edge-case-hunter). **high** -- verified: Postgres upsert's `ON CONFLICT DO UPDATE` only sets columns present in the payload; `deleted_at` isn't one, and `app/new-fit.tsx` reuses the same `fitId` across a retry by design. The app reports success and navigates away while the Fit is permanently invisible to every `deleted_at is null` query. Routed: patch.
2. Frozen `## Boundaries & Constraints` requires success microcopy "Fit saved." on a successful save; nothing in the diff shows it -- `handleConfirmSave` calls `reset()`/`dismissTo` silently (blind-hunter). **high** -- verified against the spec's own frozen text and the full diff; no such text exists anywhere. Routed: patch (mirror `add-item.tsx`/`wardrobe.tsx`'s existing `itemAdded`-param ack-banner precedent for the Fits tab).
3. `components/fitBuilder/SaveFitSheet.tsx` -- the backdrop `Pressable` and the `Modal`'s `onRequestClose` both call `onClose` unconditionally, including while `saving` is true, letting a user dismiss the sheet mid-save; the in-flight `uploadCover`/`insertFit` promise still resolves against `app/new-fit.tsx`'s state after the sheet is gone (blind-hunter, edge-case-hunter). **medium** -- verified: a success mid-dismiss silently navigates the user away with no action on their part; a failure sets `connectionError` on a component no longer rendered, so the block-and-keep retry the frozen spec requires is never seen. Routed: patch.
4. `app/new-fit.tsx` `handleSavePress` -- a `captureRef` failure only logs to console/Sentry; `opening` returns to `false` with no sheet and no error shown, contradicting the AC "when I tap Save, then I see a rendered collage" (edge-case-hunter, claim-check). **medium** -- verified: the outer `catch` block has no user-visible effect. Routed: patch.
5. `supabase/tests/rls.test.ts` -- the new `fits/fit_items RLS` block tests SELECT/INSERT/DELETE cross-user isolation for `fit_items`, but the migration also defines `fit_items_update_own` with no corresponding impersonated-UPDATE test, unlike the sibling `fits` block (blind-hunter). **low** -- verified: no UPDATE case exists for `fit_items`. Routed: patch (one more test case, folded into the bundle).
6. `lib/fits/errors.ts` exports `UNKNOWN_ERROR_MESSAGE`; nothing in the diff imports or renders it, since `handleConfirmSave` treats every failure through the single `connectionError` UI (blind-hunter). **low** -- verified true by search; dead export. Routed: patch (delete it).
7. `supabase/migrations/0004_fits.sql` adds `fits.is_favorite boolean not null default false`, outside the frozen spec's Boundaries/Code Map, unwritten/unread by any code in this diff, and not mentioned in the table's own `comment on table` (blind-hunter). **low** -- verified: real gap, but the column itself is correct per `data-model.md`'s canonical `fits` schema (Epic 4's favorite toggle) -- removing it would just require re-adding it in a later migration. Routed: patch (document the reservation in the table comment; keep the column).
8. `fit_items.item_id` (FK to `wardrobe_items`, `on delete cascade`) has no index, unlike `fit_id` (blind-hunter). **low if real, out of this story's scope** -- verified no query in this diff looks up `fit_items` by `item_id`; Story 3.4 ("Fit behavior when a wardrobe item is deleted") is the actual consumer of that lookup path. Routed: defer.
9. `app/new-fit.tsx`'s Save pill passes `colors.light.surfaceRaised` (not the scheme-aware `closeButtonColor` every other icon on the screen uses) to `CheckIcon` (blind-hunter). **false** -- verified against `components/ui/Button.tsx`: its own primary-variant `ActivityIndicator` and text both hardcode the same non-scheme-aware `surface-raised` color for content against the accent fill, unlike the ink-toned secondary icons this findings compares it to. Matches existing convention, not a deviation.
10. `supabase/migrations/0004_fits.sql` creates both a plain `fits_user_id_idx` and a partial `fits_user_id_not_deleted_idx`, called redundant since every query path filters `deleted_at is null` (blind-hunter). **false** -- verified this exact two-index pair already exists unmodified in `0003_wardrobe_items.sql`, which this migration's own header comment says to mirror; changing it here alone would make the two tables inconsistent for no story-level reason.
11. `fit_items.x/y/scale/rotation` have no `CHECK` constraints, unlike `cover_path`'s constraint in the same migration (blind-hunter). **low** -- verified real: no DB-level bound enforcement. Rejected: the canvas/store layer (`stores/fitBuilder.ts`'s `clamp01`, `CanvasItem`'s drag/pinch clamps from Story 3.1's own review pass) already enforces these bounds at the only place that writes them; adding per-column CHECK constraints is more than a direct correction (each column needs its own bound decided) for a defect no code path can currently trigger.
12. `handleSavePress`'s re-entrancy guard (`opening || saving || ...`) has no test exercising a rapid double-tap (blind-hunter). **low** -- verified the guard exists but is untested. Rejected: narrow edge case: simulating a true double-press race is more than a direct correction, and the guard's own logic is simple enough to read correctly by inspection.
13. `saveFit.ts`'s rollback helpers (`rollbackCover`, `rollbackOrphanedFit`) swallow their own storage/DB errors via `.catch(() => {})` with no Sentry logging, so a failed rollback is undetectable (edge-case-hunter). **medium if real, pre-existing** -- verified this is the exact pattern already shipped in `lib/wardrobe/addItem.ts`'s own rollback calls (`saveBatch`, `uploadItem`), which this story's spec explicitly required mirroring. Not caused by this story; fixing it here alone would leave `addItem.ts` inconsistent. Routed: defer.
14. A retry could reuse `pendingSave.collageUri` after its temp capture file was cleared by the OS/view-shot, making `uploadCover`'s `file.arrayBuffer()` throw even though canvas/name state looks intact (edge-case-hunter). **maybe-false** -- would need on-device testing of `react-native-view-shot`'s temp-file lifetime across a short retry window to settle; no evidence in this diff that it happens. If true, only **low** (recoverable by dismissing and reopening the canvas, which re-captures). Rejected per the low-severity note.

Routing outcome: findings #1-#7 are bundled into one **patch** pass since they're independent, well-scoped fixes with no interaction between them; #8 and #13 are **defer** (logged to `deferred-work.md`); #9 and #10 are **false** (rejected); #11, #12, #14 are rejected as low-severity with more-than-trivial fixes.

## Design Notes

The Save pill is the screen's one primary-accent element (`DESIGN.md`'s "accent is the one deliberate color exception" rule) — everything else on this screen (Cancel, Background, Add item) stays ink/outline. It sits top-right, mirroring the Cancel circle already at top-left, so the canvas-mode chrome stays a single floating row rather than growing a new header bar. `SaveFitSheet` reuses `CanvasBackgroundSheet`'s exact Modal/backdrop/drag-handle chrome so the sheet family stays visually consistent across the builder.

No dedicated preview/save mockup exists in the UX design set (`fit-builder-canvas.html` only covers the template-picker and canvas states) — this screen's layout is this spec's own design decision, not lifted from a reference image.

## Verification

**Commands:**
- `npx jest --runInBand` -- expected: full suite passes, including the new `nextFitName`/`saveFit`/`saveFitSheet` tests.
- `npx tsc --noEmit` -- expected: no type errors.
- `npx expo lint` -- expected: no errors.
- `supabase/migrations/0004_fits.sql` must be applied to the linked Supabase project (via the Supabase CLI or dashboard) before `supabase/tests/rls.test.ts`'s new block or any manual save can pass — this is an external, shared-system change; confirm with the human before running it, do not apply it silently.

**Manual checks (if no CLI):**
- On simulator/device: Save renders a collage that visually matches the canvas; the name field is pre-filled and editable; saving with no network shows the block-and-keep message and leaves the sheet's state intact; a successful save lands back on the Fits tab.
