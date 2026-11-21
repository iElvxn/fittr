---
title: 'Batch save keeps items that saved instead of rolling them back'
type: 'bugfix'
created: '2026-11-19'
status: 'done'
baseline_commit: 'd3383792d4d9a5cd0ba2a730c5940e7484b89c5f'
route: 'dispatch'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When a batch save fails partway, `saveBatch`'s rollback removes the earlier items' Storage files but its `wardrobe_items` hard delete matches nothing (no DELETE policy), so those rows survive without images and show as broken tiles in the wardrobe grid.

**Approach:** Remove the rollback of items that saved. Each item is complete on its own (files + row), so it stays saved. The queue marks those items as saved, and the retry saves only the rest.

**Decisions (2026-11-19):**
- Option A, chosen over B (soft-delete rollback) and C (one batch RPC). Wardrobe items are independent, so each succeeds or fails alone, as in Google Photos, Drive and Dropbox.
- A saved item stays in the queue as a locked row: its thumbnail, a "Saved" checkmark, and no edit, remove or retake.
- After a partial save, the error reads "Saved N of M. No connection — the rest are still here. Try again." (N = saved count, M = the number of items currently in the queue, saved and unsaved; it drops if an unsaved item is removed. Analytics `batch_size` stays the size at the first Save tap). The primary button becomes "Save remaining" once any item is saved. For a non-connection failure, the error reads "Saved N of M." followed by the existing unknown-error message. When nothing has saved, today's copy and the "Save all" label stay unchanged.

## Boundaries & Constraints

**Always:** an item counts as saved only once both its files and its row are written; the failing item's own Storage files are still cleaned up (it has no row, so nothing shows); items save sequentially and the save stops at the first failure, as today; retries reuse each item's `itemId` (upsert idempotency unchanged); `trackItemAdded` fires once per item at the moment it saves, with `batchSize` = the batch's size at the first Save tap; the wardrobe query is invalidated after any attempt that saved at least one item.

**Never:** no schema or RLS change; no hard delete or soft delete of saved items from the client; no background or automatic retry; no change to single-item `uploadItem`/`insertWardrobeItem` behaviour.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| All save | 5 ready items, Save all | All 5 saved, screen dismisses to Wardrobe | N/A |
| Fails partway | Item 3 of 5 fails | Items 1–2 show as locked "Saved" rows; 3–5 remain editable; button reads "Save remaining" | "Saved 2 of 5. No connection — the rest are still here. Try again." |
| Retry after partial | Items 1–2 saved, tap "Save remaining" | Only items 3–5 are uploaded and inserted; dismisses on success | Count updates (e.g. "Saved 3 of 5") if it fails again |
| Cancel after partial | Items 1–2 saved, tap Cancel | Screen closes; items 1–2 remain in the wardrobe with images | N/A |
| First item fails | Item 1 of 5 fails | Nothing saved, every item still editable | Existing error notice, unchanged copy |

</frozen-after-approval>

## Code Map

- `lib/wardrobe/addItem.ts:112-159` -- `saveBatch`: delete the saved-items rollback (lines 147-155); keep the failing item's own Storage cleanup (line 146). Add an `onItemSaved(itemId)` callback parameter so the caller learns each success as it happens, even when a later item throws. Rewrite the doc comment.
- `stores/wardrobeCapture.ts` -- `BatchItem` gains `saved: boolean` (default false) and a `markItemSaved(id)` action. Keep `status` for processing state only.
- `app/add-item.tsx:222-270` -- `handleSaveAll`: send only unsaved items, mark each saved and track it from the callback, capture `batchSize` once, invalidate with `'none'` refetch on failure (as today). Dismiss when every item is saved. Use the partial-save copy and the "Save remaining" label from the Decisions. `handleRemove`/`handleRetake` must not act on saved items. `allReady` must still treat saved items as ready.
- `components/wardrobe/BatchQueueRow.tsx` -- a locked saved row (cutout thumbnail, label, "Saved" checkmark, with `accessibilityLabel` "Saved"). It has no chevron, no RemoveButton and no editor. Follow the existing `surface-raised` card styling.
- `__tests__/addItem.test.ts:108-180` -- replace the rollback test. Keep the stop-on-first-failure test.
- `__tests__/wardrobeCapture.test.ts`, `__tests__/addItemScreen.test.tsx`, `__tests__/batchQueueRow.test.tsx` -- extend.
- Do not touch: `uploadItem` (its own two-file rollback is correct), `insertWardrobeItem`, migrations.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/addItem.test.ts` -- failing tests first: a partial failure removes no saved item's files and issues no row delete; `onItemSaved` fires for each saved item in order; the failing item's files are still removed.
- [x] `lib/wardrobe/addItem.ts` -- remove the rollback, add `onItemSaved`, rewrite the doc comment.
- [x] `__tests__/wardrobeCapture.test.ts` + `stores/wardrobeCapture.ts` -- `saved` flag and `markItemSaved`; `reset` clears it.
- [x] `__tests__/batchQueueRow.test.tsx` + `components/wardrobe/BatchQueueRow.tsx` -- saved-row rendering.
- [x] `__tests__/addItemScreen.test.tsx` + `app/add-item.tsx` -- retry sends only unsaved items; partial-failure copy; analytics once per item; Cancel after a partial save closes the screen.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark the `saveBatch` rollback entry resolved by this spec.

**Acceptance Criteria:**
- Given a batch where item 3 of 5 fails, when the grid is refetched, then items 1–2 show with their images and no broken tiles exist.
- Given a partial save followed by a successful retry, when analytics are inspected, then exactly 5 `item_added` events fired, each with `batch_size` 5.

## Implementation Notes

- Implemented directly, task by task, test first (red confirmed for each), per the user's workflow preferences.
- `saveBatch` calls `onItemSaved` outside the `try`, so a throwing callback can't trigger cleanup of an item that did save.
- "Saved N of M": N and M are derived at render from the queue. M is the queue's current length, so it stays truthful if an unsaved item is removed after a partial save; analytics `batch_size` comes from a ref set at the first Save tap and doesn't shrink.
- `handleRemove` now closes the screen when the last *unsaved* item is removed (generalises the old "last item" rule); saved items are ignored by remove/retake.
- Extra test beyond the task list: the retry failing again updates the count ("Saved 2 of 3"), covering the matrix's Retry row.
- Running Prettier reformatted `app/add-item.tsx` wholesale (the repo has no Prettier config); reverted and re-applied only the intended edits. Don't run Prettier on this repo.
- Full suite: 1118 passed, 50 skipped (RLS suite, needs `--env-file`). `tsc --noEmit` clean. ESLint: 0 errors; warnings are pre-existing.

## Spec Change Log

- 2026-11-21 (review pass 1): finding #2 showed "M = batch size" had two readings. The human chose the on-screen queue count and amended the frozen Decision. No code change was needed; the shipped `savedPrefix` already uses `items.length`. KEEP: analytics `batch_size` from `batchSizeRef` (first Save tap).

## Review Triage Log

Pass 1 (blind-hunter, edge-case-hunter, verification-gap):

| # | Finding | Verdict | Evidence | Route |
|---|---------|---------|----------|-------|
| 1 | VG gap: no test that a throwing `onItemSaved` skips cleanup of a saved item (also blind) | medium | Pre-verified gap: moving the callback inside the `try` would delete a saved item's files and every `saveBatch` test would still pass. | patch |
| 2 | "Saved N of M" uses live `items.length`, so M drops when an unsaved row is removed; spec says M = batch size (edge, blind) | medium | `app/add-item.tsx:72`. Frozen Decision says "M = batch size"; "batch size" can mean the original batch (as analytics uses) or the queue on screen. Two readings. | intent_gap → resolved 2026-11-21: human chose M = items currently in the queue (matches the shipped code); frozen Decision amended |
| 3 | Remove/Cancel/field edits stay live while a save is in flight (edge ×2, blind) | medium | Rows and Cancel aren't disabled while `submitting`; `saveBatch` works from a snapshot. Existed before this change (old code also sent a snapshot and had live Cancel/Remove). | defer |
| 4 | Upsert commits but its response is lost: catch removes the failing item's files while its row exists (edge ×2) | medium | `lib/wardrobe/addItem.ts` catch is unchanged from baseline line 146. A retry heals it (re-upload + upsert); Cancel leaves a broken tile. Pre-existing. | defer |
| 5 | `trackItemAdded` throwing inside the callback stops the batch (edge, blind) | low | `posthog.capture` is the SDK's fire-and-forget queue; it isn't expected to throw. Fix adds a guard. | reject |
| 6 | Grid stays stale after Cancel/remove-last following a partial save (blind) | false | `app/(tabs)/wardrobe.tsx:89` uses `useRefreshOnFocus`, which refetches stale active queries on focus; the `'none'` invalidation marks it stale. | reject |
| 7 | Header "3 items" counts saved rows next to "Save remaining" (blind) | low | Real but cosmetic: the header counts the rows shown. Rare (partial saves only); fix adds a branch. | reject |
| 8 | Saved-row comment says edits go through Item detail but gives no link (blind) | false | It's a code comment, and true: saved items are edited from Item detail. No user-facing claim. | reject |
| 9 | Spec file is untracked; deferred entry cites a deleted line (blind) | false | The spec is committed with this change. The deferred-work line ref is a historical record of where the bug was. | reject |
| 10 | Redundant `not.toHaveBeenCalledWith`; no test without the optional callback (blind) | false | The happy-path test already calls `saveBatch` with no callback. The redundant line is harmless documentation. | reject |
| 11 | `itemId as string` casts unchecked (blind) | false | `handleSaveAll` returns early unless `allReady`, and `setItemProcessed` sets `itemId` in the same update that sets `status: 'ready'`. | reject |

## Verification

**Commands:**
- `npx jest __tests__/addItem.test.ts __tests__/wardrobeCapture.test.ts __tests__/batchQueueRow.test.tsx __tests__/addItemScreen.test.tsx` -- expected: all pass
- `npx tsc --noEmit` -- expected: no errors

**Manual checks (if no CLI):**
- On device: batch of 3, turn on airplane mode after the first item saves, then retry with the connection back. Expect the first item marked saved, only the other 2 re-uploaded, and the wardrobe showing 3 intact tiles.
