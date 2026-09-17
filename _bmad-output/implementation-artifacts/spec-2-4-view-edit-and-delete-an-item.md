---
title: 'View, Edit, and Delete an Item'
type: 'feature'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md']
baseline_commit: '43417022528af6671d4802feca34129285a9b7fc'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Wardrobe grid items (Story 2.3) aren't tappable — there's no way to see an item's full detail, correct a mis-categorized or mis-colored item, or remove one no longer owned, so the wardrobe can't stay accurate.

**Approach:** Add a pushed item-detail screen (`app/item/[id].tsx`), reached by tapping a grid cell, with a view/edit toggle for category/color/name/brand/notes (mirroring `app/(tabs)/profile.tsx`'s pattern) and a Delete action behind a native confirmation.

## Boundaries & Constraints

**Always:** grid cell tap navigates to `/item/[id]`; edits persist via an explicit Edit → Save/Cancel toggle, not autosave; delete confirms via `ActionSheetIOS` (destructive style), never swipe; delete is a soft delete (`deleted_at`), no client-side hard delete; touch targets ≥44×44pt; failures reuse `WardrobeItemError`/`NO_CONNECTION_MESSAGE`/`UNKNOWN_ERROR_MESSAGE` with block-and-keep on save, retry on delete.

**Never:** query or reference `fits`/`fit_items` — those tables don't exist until Epic 3; no new `ImageStore` abstraction; no swipe-to-delete; no `wardrobe_items` migration changes (the existing UPDATE RLS policy already covers field edits and the soft delete); no pagination.

**Decided:** since `fits`/`fit_items` don't exist yet, the Fits section renders a static "Not in any Fit yet" line (no query) and "Create Fit With This" renders disabled (`Button` `disabled` prop) — both become live once Epic 3 adds the tables and wiring, no rework needed here.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path view | Tap a grid cell | Detail shows full cutout, category, color, name/brand/notes | N/A |
| Edit save | Change fields, tap Save | Fields persist to Postgres, screen returns to view mode | N/A |
| Edit save, no connection | Tap Save while offline | Edits stay on screen, connection error shown, retry | reuse `NO_CONNECTION_MESSAGE`, block-and-keep |
| Edit cancel | Tap Cancel mid-edit | Edits discarded, original values restored | N/A |
| Delete confirm | Tap Delete, confirm in action sheet | Item soft-deleted, navigates back to Wardrobe grid | N/A |
| Delete cancel | Tap Delete, cancel in action sheet | No change, still on item detail | N/A |
| Delete, no connection | Confirm delete while offline | Stays on item detail, connection error shown, retry | reuse `NO_CONNECTION_MESSAGE` |

</frozen-after-approval>

## Code Map

- `app/item/[id].tsx` (new) -- detail screen; view/edit toggle mirrors `app/(tabs)/profile.tsx` exactly (`isEditing`, `saving`, `fieldError`, `connectionError` state; Edit/Save/Cancel buttons).
- `app/_layout.tsx` -- add `<Stack.Screen name="item/[id]" />` (pushed, not modal; no native header anywhere in this app).
- `lib/wardrobe/updateItem.ts` (new) -- `updateWardrobeItem(userId, itemId, input)`: partial `.update(...).eq('id', itemId)` on `wardrobe_items`; error handling mirrors `lib/wardrobe/addItem.ts` (`WardrobeItemError`, not `updateProfile.ts`'s `SignUpError`).
- `lib/wardrobe/deleteItem.ts` (new) -- `deleteWardrobeItem(userId, itemId)`: `.update({ deleted_at: <now> }).eq('id', itemId)`; existing `wardrobe_items_update_own` RLS policy already covers this per its own migration comment.
- `components/wardrobe/CategoryPicker.tsx`, `components/wardrobe/ColorSwatchPicker.tsx` (new, extracted from `components/wardrobe/BatchQueueRow.tsx`'s inline category-chip row and `COLOR_SWATCHES` swatch row) -- controlled (`value`/`onChange`), reused by both `BatchQueueRow` and the new edit form so the palette/category list can't drift. `BatchQueueRow.tsx` updated to use them; `__tests__/batchQueueRow.test.tsx` should pass unchanged.
- `components/wardrobe/WardrobeGridCell.tsx`, `app/(tabs)/wardrobe.tsx` -- wrap cell in `Pressable`, `onPress` → `router.push(\`/item/${item.id}\`)`; removes 2.3's "not tappable yet" boundary.
- `lib/wardrobe/listItems.ts` -- no changes; detail screen reads its row from the already-cached `useWardrobeItems(userId)` list (no pagination in Phase 1) instead of a new single-item query.
- `lib/wardrobe/thumbnailUrls.ts`, `lib/wardrobe/errors.ts` -- reused as-is (`useThumbnailUrls([item.cutout_path])` for the full-size image).
- `supabase/migrations/0003_wardrobe_items.sql`, `supabase/tests/rls.test.ts` -- no changes; UPDATE RLS + its cross-user isolation test already cover edit and soft-delete.

## Tasks & Acceptance

**Execution:**
- [x] `lib/wardrobe/updateItem.ts` + `__tests__/updateItem.test.ts` -- add `updateWardrobeItem()`, test success + no-connection mapping.
- [x] `lib/wardrobe/deleteItem.ts` + `__tests__/deleteItem.test.ts` -- add `deleteWardrobeItem()`, test the soft-delete payload + error mapping.
- [x] `components/wardrobe/CategoryPicker.tsx`, `components/wardrobe/ColorSwatchPicker.tsx` -- extract from `BatchQueueRow.tsx`; confirm `batchQueueRow.test.tsx` still passes.
- [x] `components/wardrobe/WardrobeGridCell.tsx`, `app/(tabs)/wardrobe.tsx` -- make cells tappable, navigate to `/item/[id]`.
- [x] `app/item/[id].tsx`, `app/_layout.tsx` -- detail screen: view mode, Edit toggle, Save/Cancel, Delete via `ActionSheetIOS`.
- [x] `__tests__/itemDetail.test.tsx` -- render tests covering every I/O-matrix row.

**Acceptance Criteria:**
- Given the item detail screen, when it loads, then it shows the full cutout, category, color, name/brand/notes, the "Not in any Fit yet" line, and a disabled "Create Fit With This" button.
- Given a screen-reader user on the detail screen, then each editable field/control announces its accessible label.

## Implementation Notes

- `app/item/[id].tsx` collapses the Code Map's `fieldError`/`connectionError` two-state shape (mirroring `profile.tsx`) into a single `errorMessage: string | null` -- this screen has no client-side field validation to give `fieldError` a distinct job, so one string covers both the no-connection and unknown-error cases identically to how `wardrobe.tsx`'s own error branch already does it.
- `updateWardrobeItem`/`deleteWardrobeItem` take only `itemId`, not `userId` as the Code Map sketched -- the `wardrobe_items_update_own` RLS policy already scopes the write to `auth.uid()`, so a `userId` parameter would be unused in the query.
- Extracted `components/wardrobe/SectionLabel.tsx` alongside the two Code-Map-listed pickers (not originally called out) -- `BatchQueueRow.tsx` had its own private `SectionLabel`, and the item-detail screen needed the identical "uppercase, tracked-out" label for both its view-mode rows and edit-mode fields; sharing it avoids a second inline copy.
- `app/(tabs)/wardrobe.tsx`'s `router.push(\`/item/${item.id}\`)` needs an `as Href` cast (from `expo-router`) -- Expo Router's typed routes are generated into the gitignored `.expo/types/router.d.ts` by `expo start`/`export`, and this is the app's first dynamic route; the union type picks up `/item/[id]` automatically the next time either command runs (attempted in this sandbox to regenerate it live but Metro's cold start didn't complete in time -- a sandbox limitation, not a code issue). `npx tsc --noEmit` is clean with the cast in place.
- `ActionSheetIOS` has no prior test-mocking precedent in this repo; `__tests__/itemDetail.test.tsx` uses `jest.spyOn(ActionSheetIOS, 'showActionSheetWithOptions')` rather than `jest.mock('react-native', ...)` -- a full module mock re-triggers nativewind's `react-native-css-interop` require chain and throws (`Cannot read properties of undefined (reading 'Component')`).
- Aesthetic pass (via `ui-ux-pro-max`): the view-mode layout was revised from five stacked labeled rows (Category/Color/Name/Brand/Notes, each with its own `SectionLabel`) to an editorial headline treatment -- the item's name (or category, if unnamed) as a `display`-variant (Cormorant) headline, with category/color/brand collapsed into one small-caps caption line beneath (`colorLabel()`, new in `ColorSwatchPicker.tsx`, shows the swatch's human name instead of a raw hex). This also corrected a miss against this spec's own Design Notes: "Create Fit With This" and "Edit" were originally stacked as full-width buttons instead of the row the Design Notes called for -- now a `flex-row` pair, with Delete kept as a separate plain-text action beneath.

- Security review (`security-review` skill): no findings. All writes (`updateWardrobeItem`, `deleteWardrobeItem`) go through the existing `wardrobe_items_update_own` RLS policy scoped to `auth.uid()`; the detail screen resolves its item from the already user-scoped `useWardrobeItems` cache rather than an unscoped fetch-by-id, so an arbitrary `id` route param can't expose another user's item (IDOR-safe by construction, not by added validation).

## Spec Change Log

## Review Triage Log

Three layers ran against the diff since baseline: Blind Hunter (8 findings, re-run after an initial capture of the diff was corrupted by stderr splicing into the same redirect), Edge Case Hunter (6 findings), and Verification Gap Reviewer (2 findings, both pre-verified per its own file reads).

- **Grid-cell tap-to-navigate has no test** (verification-gap) — `low` — confirmed: `WardrobeGridCell` became a `Pressable` with a required `onPress`, wired in `wardrobe.tsx` to `router.push`, but no test in `wardrobeGrid.test.tsx` presses a cell or asserts `router.push`. Route: `patch` — add the case.
- **Unnamed-item caption branch has no test** (verification-gap) — `low` — confirmed: every `itemDetail.test.tsx` fixture sets `name`, so the caption's category-omission-when-named conditional is never exercised in the untested direction. Route: `patch` — add a `makeItem({ name: '' })` case.
- **Query failure on the underlying item list is shown as "item no longer in your wardrobe," not a retry state** (edge-case-hunter + blind-hunter, same root cause) — `medium` — confirmed: `app/item/[id].tsx` destructures only `data`/`isLoading` from `useWardrobeItems`, never `isError`; a network failure and an actual soft-delete both render the identical not-found copy with no retry, breaking from every other screen's connection-error convention (`wardrobe.tsx`'s own `ConnectionErrorNotice` + retry). Route: `patch` — add an error branch mirroring `wardrobe.tsx`, plus tests for loading/error/not-found states (also closes blind-hunter's "two coded states have zero coverage").
- **Edit stays tappable while a delete is in flight** (edge-case-hunter + blind-hunter, same root cause) — `low` — confirmed: only the Delete pressable checks `disabled={deleting}`; Edit renders in the same view-mode block, unguarded. A rapid Delete-then-Edit-then-Save could write field values onto a row whose `deleted_at` was just set. Route: `patch` — add `disabled={deleting}` to Edit.
- **Header back control isn't guarded during save/delete, so a stray `router.back()` can fire after the user already navigated back manually** (edge-case-hunter) — `medium` — confirmed: `handleDelete`'s `router.back()` runs unconditionally on success; if the user taps the header back button first, the in-flight delete's own `router.back()` fires a second time once it resolves, popping past the intended screen. Route: `patch` — disable the back control while `saving || deleting`, matching the existing `disabled={saving}` pattern already used on Cancel.
- **Color is silently dropped from the view when unset, contradicting this spec's own "shows... color" Acceptance Criterion; the caption can render fully blank for a minimal item** (edge-case-hunter, high-confidence claim + blind-hunter, same root cause) — `medium` — confirmed: `colorLabel(item.color_hex)` returns `null` for an unset color and `.filter(Boolean)` drops it silently; for an unnamed item with no color or brand the whole caption line evaluates to `''`. Route: `patch` — fall back to a "No color set" string so color always renders and the caption can never be empty.
- **Delete's unknown-error path has no test** (blind-hunter) — `low` — confirmed: only delete's `no_connection` rejection is tested; the identical `reportUnknownError` branch it shares with save is untested on the delete side. Route: `patch`.
- **"Block-and-keep" on a failed save isn't actually asserted** (blind-hunter) — `low` — confirmed: the offline-save test checks the error text and that Save is still present, but never asserts the in-progress edit (e.g. the changed category) is still selected — a regression that reset the form on error would pass. Route: `patch`.
- **`CATEGORY_LABELS` is independently derived in three files** (blind-hunter) — `low`, developer-facing — confirmed: `BatchQueueRow.tsx`, `WardrobeGridCell.tsx`, and `app/item/[id].tsx` each compute the identical map, inconsistent with this same diff's stated reason for extracting `CategoryPicker`/`ColorSwatchPicker` ("so the palette/category list can't drift"). Route: `patch` — hoist it into `lib/wardrobe/addItem.ts` as a shared export.
- **Implementation Notes omits the `fieldError`/`connectionError` → single `errorMessage` simplification** (blind-hunter) — `low` — confirmed: the Code Map cites `profile.tsx`'s two-state shape; the actual screen collapsed it to one, and that deviation (unlike three others) wasn't logged. Route: `patch` — append the missing note.
- **Back control's touch target may fall short of the spec's own ≥44×44pt "Always" rule** (blind-hunter) — `medium` — confirmed: the `‹` glyph is a bare 22px-line-height `Text` in a `Pressable` with only `hitSlop={12}`, no explicit min width/height; the horizontal reach isn't demonstrably ≥44pt. Route: `patch` — give the control explicit `minWidth`/`minHeight`.
- **Edit/delete don't re-check the row hasn't changed since it was loaded (multi-session race)** (edge-case-hunter) — `low`, rejected — requires two concurrent sessions on the same account, an unlikely everyday scenario, and the fix (re-fetch-and-compare before writing) is more than a direct correction — no guard like this exists anywhere else in the app either.
- **Edit-mode category/color/text inputs stay interactive during an in-flight save** (blind-hunter) — `low`, rejected — a change made in that window is silently dropped rather than applied (view mode re-renders from the refetched row, not local state), which is a real but narrow inconsistency; fixing it requires adding a new `disabled` prop to the shared `CategoryPicker`/`ColorSwatchPicker` components (new public surface on components `BatchQueueRow` also uses), which is more than a direct correction for a low-severity, hard-to-hit timing issue.
- **No length limit on name/brand/notes, and the redesigned view now shows the name as a large headline** (blind-hunter) — `low`, deferred — `add-item`'s identical fields have never had a length cap anywhere in this codebase; this diff's headline treatment makes an extreme-length name cosmetically worse but doesn't newly create the missing-validation gap. Logged to `deferred-work.md` rather than inventing an arbitrary limit unilaterally.

## Design Notes

- View/edit toggle is one screen, two render states -- not a modal, not a separate route, exactly `profile.tsx`'s shape.
- Cutout fills the top edge-to-edge minus gutter; metadata (`body`/`meta`) below; actions as a row of secondary/icon buttons beneath, per epic-2-context.md's item-detail layout guidance.
- No native header (matches the app's `headerShown: false`); a minimal in-screen back control (`‹`, `accessibilityLabel="Back"`, `onPress={() => router.back()}`) -- first pushed (non-modal, non-tab) screen in the app, closest precedent is add-item's modal Cancel, adapted for push semantics.
- Delete is plain text styled with the existing `text-destructive`/`text-destructiveDark` tokens (`BatchQueueRow`'s `RemoveButton` precedent) -- no destructive `Button` variant exists yet and this story doesn't need one.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no type errors.
- `npm test -- updateItem deleteItem itemDetail batchQueueRow wardrobeGrid` -- expected: all pass.

**Manual checks (if no CLI):**
- On a device with at least one saved item: tap a grid cell, confirm detail renders; edit fields and Save, confirm the change persists after navigating away and back; Cancel mid-edit, confirm no change; Delete with confirm, confirm the item leaves the grid; Delete with cancel, confirm the item remains.
