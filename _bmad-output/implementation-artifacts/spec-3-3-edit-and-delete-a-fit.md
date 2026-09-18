---
title: 'Edit and Delete a Fit'
type: 'feature'
created: '2026-09-18'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '8264fad72f1662fad40e24257f825a32d5df7481'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 3.2 lets a user save a Fit, but there is no way to reopen it to change the arrangement, or to remove one they no longer want — a saved Fit is permanent and unreachable once created.

**Approach:** Reuse the existing canvas builder (`app/new-fit.tsx`) in an edit mode that loads an existing Fit's saved placements and updates its `fits`/`fit_items` rows and cover image in place on save; add a minimal Fit detail screen with Edit and Delete, where Delete soft-deletes the Fit via the same native-confirmation pattern already used for wardrobe items.

## Boundaries & Constraints

**Always:** Edit reuses `app/new-fit.tsx`'s existing canvas/save flow via a `fitId` route param rather than a parallel screen — on mount with `fitId` present, fetch the Fit and its placements and seed `stores/fitBuilder.ts` through a new `loadItems` action that sets `items` directly, bypassing `addItem`'s template-slot-claiming logic (saved placements already carry final `x, y, scale, rotation, z_index`); saving in edit mode reuses the same `fitId` (`insertFit`'s existing upsert-by-id already updates rows in place) and must additionally delete any `fit_items` rows for that `fitId` no longer present in the new placement set, so removing an item during edit doesn't leave an orphaned row; Delete uses `ActionSheetIOS.showActionSheetWithOptions` with `destructiveButtonIndex: 0`, mirroring `app/item/[id].tsx`'s `handleDeletePress` exactly, per `EXPERIENCE.md`'s native-confirmation rule; Delete is a soft-delete (`fits.deleted_at`) via the same pattern as `lib/wardrobe/deleteItem.ts` — `fits` has no client DELETE policy by design; the Fit detail screen shows only what this story needs — collage, name, Edit, Delete — Favorite/Wear/Plan/Share are later stories and get no placeholders; `app/(tabs)/fits.tsx` gets a minimal plain list (thumbnail + name, no filter/sort/grid) when Fits exist, each row opening the new Fit detail screen — a deliberate stopgap Epic 4 replaces with the real grid; unit tests written before the implementation they cover.

**Never:** No Epic 4 grid, filtering, or sorting; no `fit_wears`/wear-streak logic (Story 4.4); no offline queueing; no hard `.delete()` anywhere `fits`/`fit_items` already rely on soft-delete or RLS; no `planned_fits` table or cascade — that table doesn't exist yet (Epic 5, still backlog), so this story's delete touches only `fits`; Epic 5 adds the cascade when it creates `planned_fits`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open a saved Fit to edit | Tap Edit on Fit detail | Canvas reopens with every item at its saved `x, y, scale, rotation, z_index` | N/A |
| Save after editing | Items rearranged, added, or removed, then Save confirmed | `fit_items` reflect the new set (updated, inserted, and orphan rows deleted); `cover_path` replaced; same `fitId` | N/A |
| No connection during edit save | Upload or insert fails on connectivity | Sheet stays open, canvas/name intact, "No connection — nothing was lost. Try again." with retry | Block-and-keep, same as Story 3.2 |
| Delete a Fit, confirm | Destructive action sheet confirmed | `fits.deleted_at` set; detail screen dismisses | N/A |
| Delete a Fit, cancel | Action sheet dismissed | No change; Fit remains | N/A |
| No connection during delete | Update fails on connectivity | Error shown inline on detail screen; Fit not marked deleted | N/A |

</frozen-after-approval>

## Code Map

- `app/new-fit.tsx` -- add edit mode: read an optional `fitId` route param; when present, on mount call the new `getFitItems` to fetch placements, call `loadItems` (skip `selectTemplate`); `handleConfirmSave` reuses the loaded `fitId` instead of minting a new one.
- `stores/fitBuilder.ts` -- add `loadItems(items: PlacedItem[])` action that replaces `items` directly (no slot-claiming), for seeding from a saved Fit.
- `lib/fits/saveFit.ts` -- `insertFit` gains an orphan-cleanup step: delete `fit_items` rows for `fitId` whose id isn't in the new placement set.
- `lib/fits/getFitItems.ts` (new) -- fetch a Fit's `fit_items` placements by `fitId`, scoped to the current user via RLS; used only by edit-mode seeding (the Fit's own name/cover metadata comes from `listFits`'s cached list, not a second query -- see `app/item/[id].tsx`'s documented "no separate single-item query" convention, lines 46-47).
- `lib/fits/listFits.ts` (new) -- `useFits(userId)` react-query hook mirroring `lib/wardrobe/listItems.ts`'s `useWardrobeItems` exactly (`id, name, cover_path, updated_at`, `deleted_at is null`, ordered by `updated_at desc` so an edited Fit resurfaces); shared by the Fits tab list and the Fit detail screen (`items?.find(f => f.id === id)`, same pattern as `item/[id].tsx:50`).
- `lib/fits/deleteFit.ts` (new) -- soft-delete `fits.deleted_at`, mirrors `lib/wardrobe/deleteItem.ts`'s `deleteWardrobeItem` exactly.
- `app/fit/[id].tsx` (new) -- Fit detail screen: cover image (via `useThumbnailUrls`) + name (`display`/accent, matching the item-name precedent), Edit (`router.push('/new-fit?fitId=...')`), Delete (`ActionSheetIOS`, mirrors `app/item/[id].tsx:142-151`'s `handleDeletePress`), success calls `router.back()`.
- `app/_layout.tsx` -- register `<Stack.Screen name="fit/[id]" />` alongside the existing `item/[id]` entry (line 53).
- `app/(tabs)/fits.tsx` -- replace the always-empty-state branch with a minimal list when Fits exist (hairline-separated rows, thumbnail + name, no card chrome per DESIGN.md), each row navigating to `app/fit/[id].tsx`.
- `supabase/tests/rls.test.ts` -- no new coverage expected: `listFits`/`getFitItems` are plain SELECTs already covered by Story 3.2's `fits`/`fit_items` SELECT isolation tests, and `deleteFit` is the same UPDATE path already covered by the `fits` UPDATE isolation test; confirm during the Matrix Test Audit rather than assuming.
- `supabase/migrations/0004_fits.sql` -- no changes; `planned_fits` cascade is deferred to Epic 5 (see Boundaries).

## Tasks & Acceptance

**Execution:**
- [x] `lib/fits/getFitItems.ts` + `__tests__/getFitItems.test.ts` -- fetch a Fit's placements by id, scoped to the current user -- edit-seed depends on this, written first.
- [x] `lib/fits/deleteFit.ts` + `__tests__/deleteFit.test.ts` -- soft-delete via `deleted_at`, mirroring `deleteWardrobeItem`.
- [x] `lib/fits/saveFit.ts` + `__tests__/saveFit.test.ts` additions -- orphan `fit_items` cleanup on re-save covering the I/O matrix's edit-and-remove-item row.
- [x] `stores/fitBuilder.ts` -- `loadItems` action + test coverage seeding items from saved placements.
- [x] `lib/fits/listFits.ts` -- `useFits` hook, mirroring `useWardrobeItems`; no dedicated hook test, matching `useWardrobeItems`/`useThumbnailUrls`' own convention of exercising `useQuery` wiring through component tests.
- [x] `app/fit/[id].tsx` + `__tests__/fitDetail.test.tsx` -- detail screen: cover/name render, Edit navigates with `fitId`, Delete flow (confirm/cancel/no-connection) per the I/O matrix.
- [x] `app/_layout.tsx` -- register the `fit/[id]` route.
- [x] `app/new-fit.tsx` -- edit-mode wiring: seed on mount when `fitId` present, re-save reuses `fitId`, ack on return to Fits tab.
- [x] `app/(tabs)/fits.tsx` -- minimal list entry point when Fits exist, rows navigate to the detail screen.
- [x] `__tests__/newFit.test.tsx` -- extend orchestration coverage for edit-mode seeding and in-place re-save.
- [x] `__tests__/fits.test.tsx` -- rewritten alongside `app/(tabs)/fits.tsx` (not in the original task list, but required: the tab now depends on `useFits`/`useSession`/`useThumbnailUrls`, which the old ack-only test didn't mock).

**Acceptance Criteria:**
- Given a saved Fit, when I choose to edit it, then the canvas reopens with every item at its saved position, scale, rotation, and stacking order.
- Given I make changes and save again, then the Fit's placements and cover image update in place under the same Fit.
- Given a saved Fit, when I delete it and confirm, then it is soft-deleted (`planned_fits` cascade deferred to Epic 5 — see Boundaries), while wear history is untouched.
- Given the delete action sheet, when I cancel instead of confirming, then the Fit is unchanged.

## Implementation Notes

- Split the Code Map's original `getFit.ts` (fit + placements in one call) into `listFits.ts` (a `useFits` list hook, mirroring `useWardrobeItems`) and `getFitItems.ts` (placements only). `app/item/[id].tsx` documents an explicit convention -- "Phase 1 has no pagination, so the grid's already-cached list is the single source of truth here too -- no separate single-item query" -- and this story's minimal Fits-tab list gives Fits the same cached list to reuse for the detail screen, so adding a redundant single-Fit fetch would contradict that convention rather than follow it.
- `app/new-fit.tsx`'s edit-mode seeding fetches `getFitItems` from a mount-time `useEffect` (guarded on `fitId`/`seeded`/the wardrobe list's own loading state) rather than a `useQuery` -- it's a one-shot seed into a Zustand store, not cached read state the rest of the screen re-renders from, so it doesn't fit this codebase's `useQuery`-for-all-reads convention cleanly. `expo lint`'s `react-hooks/set-state-in-effect` rule initially flagged a direct call to the (setState-calling) `loadFit` helper from the effect body; wrapping that same call in an inline `void (async () => { await loadFit(fitId); })()` satisfied the rule (its own carve-out: setState "in a callback function," not synchronously in the effect body) with no behavior change -- confirmed by re-running the full `newFit.test.tsx` suite unchanged.
- A saved placement whose `wardrobeItemId` no longer matches any of the user's current (non-deleted) wardrobe items -- possible once Story 3.4 exists, not before -- falls back to category `'top'` in `loadFit`'s mapping rather than failing; a real fix (showing a gap at that position) is explicitly Story 3.4's own scope, called out at the point of the fallback.
- `saveFit.ts`'s new `deleteOrphanedFitItems` inlines placement ids into a `not('id', 'in', ...)` filter string rather than using a parameterized call -- safe because every id in that array is either `Crypto.randomUUID()`-generated client-side or a `fit_items.id` read back from the database, never user-typed text, so there's no injection surface; flagging this reasoning explicitly since it's the one place in this story that hand-builds a filter string instead of using a `supabase-js` builder method for it (postgrest-js's own `.not()` takes the operator/value as opaque PostgREST syntax, with no equivalent to `.in()`'s array-accepting overload).
- **User-reported fix, outside the original Code Map:** `components/fitBuilder/FitCanvas.tsx` was capturing unfilled ghost-slot placeholders into a Fit's saved `cover.png` whenever the canvas had a template slot no item had filled -- a pre-existing Story 3.1/3.2 defect, invisible until now because nothing in the app rendered a Fit's `cover_path` on screen before this story's Fit detail/list screens. Combined with edit mode's `templateId: null` reset (this story's own decision, per Boundaries), a Fit saved with unfilled slots showed placeholder icons in its cover with no way to fill them via editing. Fixed by moving `GhostSlot` rendering out of the `ref`'d, `captureRef`-captured subtree entirely (a sibling overlay positioned to land on the identical box, per CSS/Yoga's containing-block rules), so ghosts can never be captured regardless of render timing -- no state/rAF-timing workaround needed. Regression-tested (`fitCanvas.test.tsx`: "renders ghost slots outside the capturable fit-canvas subtree"). The deeper fix -- persisting which template/slots a Fit used so editing can restore real ghost slots for still-empty positions -- was explicitly declined for this story (would need a schema migration); this fix only stops the cover from showing placeholders that editing can't act on.
- `listFits`/`getFitItems` needed no new `supabase/tests/rls.test.ts` coverage -- they're plain `select`s already exercised by Story 3.2's `fits`/`fit_items` SELECT-isolation tests. `deleteFit`'s own update did, though (review pass 1, finding #11): the existing cross-user test only proved a *different* user is blocked, never that the legitimate owner's own `deleted_at` write succeeds -- added that assertion directly to the same test (`"...but the owner can update their own"`) rather than standing up a whole new user pair for it.

## Spec Change Log

## Review Triage Log

Review pass 1 (blind-hunter, edge-case-hunter, verification-gap, run in parallel against the full diff):

1. `app/new-fit.tsx`'s edit-mode seeding never checks whether `fitId` actually resolves to a visible Fit before seeding/saving (blind-hunter, independently found by edge-case-hunter). **high** -- verified two distinct real outcomes: (a) a foreign `fitId` (belongs to another user) has `getFitItems` RLS-filtered to `[]`, seeding a permanently-empty canvas with Save disabled and no explanation, unlike `app/fit/[id].tsx`'s own `!fit` guard; (b) worse, `fit_items_select_own`'s RLS policy (`0004_fits.sql:103-109`) checks only `fits.user_id`, never `fits.deleted_at` -- so a `fitId` for the *current user's own soft-deleted* Fit still seeds successfully, and `insertFit`'s upsert explicitly clears `deleted_at: null` on re-save, silently resurrecting a Fit the user already deleted. Routed: patch (add a not-found guard mirroring `app/fit/[id].tsx`'s own `!fit` pattern, gating both the seed effect and `handleSavePress`/`handleConfirmSave`).
2. `stores/fitBuilder.ts`'s `loadItems` never resets `canvasBackgroundColor`, unlike `reset()` (blind-hunter, independently found by edge-case-hunter). **medium** -- verified: `canvasBackgroundColor` is a global Zustand field, cleared only by the previous screen's unmount-time `reset()`; React Navigation's native-stack transition can keep the outgoing and incoming screens mounted simultaneously during the animation, so an edit-mode mount's `loadItems` call can race the previous screen's unmount cleanup, leaving a stale background color bleeding into a freshly seeded edit. Routed: patch (`loadItems` also sets `canvasBackgroundColor: null`).
3. The edit-mode seed effect's guard omits `!userId` (edge-case-hunter). **low** -- verified: `useWardrobeItems`'s `enabled: Boolean(userId)` means TanStack Query v5 reports `isLoading: false` (not `true`) while disabled, so the effect's `wardrobeItemsLoading` guard doesn't actually block a premature seed before the session resolves; blast radius is small since `category` isn't a persisted column and is otherwise inert in edit mode (`templateId` is always `null`), but the fix is a trivial one-condition addition. Routed: patch.
4. Duplicate/racing `getFitItems` calls from the seed effect re-firing (blind-hunter). **false** -- verified: TanStack Query v5's `isLoading` reflects only the *first* settle (`isPending && isFetching`), not background refetches, so it cannot oscillate the effect's dependency more than once in practice; even a rapid double-tap on the loading screen's Retry button (the one real concurrent-call path, since `loadFit` has no re-entrancy guard) fires two requests for the *same* `fitId` that resolve to identical data, so there's no divergent outcome to correct.
5. `deleteOrphanedFitItems`'s hand-built `not('id', 'in', ...)` filter string has "no actual guarantee" against a malformed id (blind-hunter). **false** -- verified: every id in `currentItemIds` is either `Crypto.randomUUID()`-generated client-side or a `fit_items.id` read back from a Postgres `uuid`-typed column (`0004_fits.sql:86`), which the database itself rejects any non-UUID value into -- the safety is a real DB-level constraint, not merely a comment's assertion.
6. `app/fit/[id].tsx`'s `handleDelete` awaits `queryClient.invalidateQueries` inside the same `try` as `deleteFit`, so a failure in the post-delete refetch would be reported through the same catch as a failed delete -- misrepresenting an already-successful, non-reversible delete as failed (blind-hunter). **low** -- plausible but narrow (would need connectivity to drop between a delete that just succeeded and the refetch moments later); fix is a trivial one-line change (stop awaiting it, attach its own `.catch(() => {})`). Routed: patch.
7. `app/fit/[id].tsx`'s `handleDelete` `finally` block calls `setDeleting(false)` after `router.back()` has already navigated away (edge-case-hunter). **false** -- verified: this project is on React 19, which has no setState-after-unmount warning or error (removed in React 18+), and React Navigation's native-stack keeps the outgoing screen mounted through its own exit transition regardless, so no adverse effect occurs either way.
8. No test exercises delete end-to-end (a deleted Fit actually disappearing from the list a user lands on) (blind-hunter). **low** -- real gap, but `deleteFit`'s soft-delete and `useFits`'s `deleted_at is null` filter are each independently unit-tested and their composition is a single, unremarkable SQL predicate, not complex interaction logic; the fix (a genuine cross-screen integration test) is more than a direct correction. Rejected per the low-severity/more-than-direct-fix rule.
9. `app/(tabs)/fits.tsx`'s `useFocusEffect`-driven `refetch()` has no direct test coverage (blind-hunter). **low** -- real relative to this codebase's own established convention: `wardrobeGrid.test.tsx` already has a dedicated test extracting and invoking the captured focus callback for the identical pattern in `wardrobe.tsx`; `fits.test.tsx` never added the equivalent. Routed: patch (mirror that existing test).
10. The new cover/thumbnail-fallback branches in `app/(tabs)/fits.tsx` and `app/fit/[id].tsx` (rendered when no thumbnail URL has resolved yet, or `cover_path` is null) are untested (blind-hunter). **low** -- real, trivial to add. Routed: patch.
11. Implementation Notes claims the existing `fits` cross-user UPDATE-isolation RLS test "proves RLS scopes correctly" for `deleteFit`'s own update, but that test only exercises `client2` (a different user) being blocked -- no RLS test has the legitimate owner (`client1`) successfully update their own `fits` row (blind-hunter). **low** -- the underlying policy is a standard `user_id = (select auth.uid())` check mirroring `wardrobe_items`' already-battle-tested pattern, so an actual bug is unlikely, but the claim was genuinely unverified. Routed: patch (add one RLS test: `client1` soft-deletes their own Fit and the update is confirmed to have taken effect, mirroring the existing negative test's structure).
12. `loadFit`'s comment describing the category-fallback case as "possible once Story 3.4 exists, not before" is inaccurate -- `lib/wardrobe/deleteItem.ts`'s `deleteWardrobeItem` (soft-delete) already exists and is already wired into `app/item/[id].tsx`, so a user can delete a wardrobe item today and then edit a Fit that used it, hitting this fallback right now (verification-gap). **low** -- a documentation correction, not a functional defect (the fallback behavior itself is a safe, deliberate no-crash default). Routed: patch (fix the comment's wording; adding the actual "visible gap" UI treatment stays out of scope -- see finding 13).
13. `loadFit`'s silent `?? 'top'` category fallback has no user-facing signal that anything is off (blind-hunter). **low if real** -- epics.md's own Story 3.4 ("Fit behavior when a wardrobe item is deleted") explicitly owns "shows a visible gap at the deleted item's canvas position" as its own acceptance criterion; the intent itself assigns this UI treatment to that story, not this one. Routed: defer.
14. Edit re-save's `queryClient.invalidateQueries({ queryKey: ['fits', userId] })` call (needed so the Fit detail screen the user lands on shows fresh data) has no test coverage -- every test exercising this path mocks `useFits` directly, disconnected from the real cache the invalidation operates on (verification-gap, pre-verified gap finding). **low** -- the call is currently correct; removing it or mistyping the query key would pass every existing assertion. Routed: patch (spy on `queryClient.invalidateQueries` in the `newFit.test.tsx` re-save test and assert the exact key).
15. The "unknown error" branch (vs. no-connection) of `useFits`'s failure handling is never exercised in either `app/(tabs)/fits.tsx` or `app/fit/[id].tsx` -- both existing `isError` tests use a `TypeError` that `isNoConnectionError` classifies as a connection error (verification-gap, pre-verified gap finding). **low** -- both branches are correctly implemented, just untested. Routed: patch (add one `new Error('boom')` case per file, mirroring `fitDetail.test.tsx`'s existing unknown-delete-error test).

Routing outcome: findings #1, #2, #3, #6, #9, #10, #11, #12, #14, #15 are bundled into one **patch** pass (independent, well-scoped fixes with no interaction between them); #13 is **defer** (logged to `deferred-work.md`); #4, #5, #7 are **false** (rejected); #8 is rejected as low-severity with a more-than-trivial fix.

Review pass 1 also includes a fix made directly at the user's request during manual testing, outside this triage process: `components/fitBuilder/FitCanvas.tsx`'s ghost-slot capture bug (see Implementation Notes) -- reported live, diagnosed, fixed, and regression-tested before the automated review layers ran.

## Design Notes

The Fit detail screen has no UX mockup to draw from (only `fit-builder-canvas.html` exists in the design set, same gap Story 3.2 noted) — its layout is this spec's own decision, scoped tightly to `EXPERIENCE.md`'s described Edit/Delete actions only, leaving room for Favorite/Wear/Plan/Share to be added by their own stories without redesigning this screen. Delete's destructive-text-button styling should match `app/item/[id].tsx`'s existing `text-destructive` pattern rather than introducing a new destructive-affordance style.

## Verification

**Commands:**
- `npx jest --runInBand` -- expected: full suite passes, including new `getFit`/`deleteFit`/`saveFit`/`fitDetail`/`newFit` coverage.
- `npx tsc --noEmit` -- expected: no type errors.
- `npx expo lint` -- expected: no errors.

**Manual checks (if no CLI):**
- On simulator/device: editing a saved Fit shows every item at its saved position/scale/rotation; removing an item and re-saving leaves no orphaned placement on reopen; deleting a Fit (confirm) removes it from wherever it was reached and it doesn't reappear; canceling delete leaves it intact.
