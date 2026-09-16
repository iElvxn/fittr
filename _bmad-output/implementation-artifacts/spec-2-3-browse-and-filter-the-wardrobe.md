---
title: 'Browse and Filter the Wardrobe'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md']
baseline_commit: '4155e979d639ae0cb6849bd3048eaedb054bc472'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Wardrobe tab is a placeholder with only an "Add item" entry point (Story 2.1); once items exist there is no way to see or narrow them, so nothing built in Story 2.1/2.2 is visible or usable yet.

**Approach:** Replace the placeholder body with a grid of item thumbnails (transparent background, total count) plus category filter chips, reading live from `wardrobe_items` via TanStack Query, with thumbnails shown through bulk-fetched signed URLs against the private `wardrobe` bucket.

## Boundaries & Constraints

**Always:** grid reads `wardrobe_items` where `deleted_at is null` for the signed-in user, via TanStack Query (no local cache-of-record), matching the epic's direct-Supabase architecture; thumbnails resolve through one bulk `createSignedUrls` call per load (not one signed-URL request per item); filter chips are "All" + the fixed five categories from `WardrobeItemCategory` (`lib/wardrobe/addItem.ts`), filtering client-side against the already-fetched list (no re-query per chip tap); total item count (unfiltered) is always visible per the AC; loading shows a skeleton grid, never a bare spinner; pull-to-refresh re-runs the query; touch targets ≥44×44pt via `hitSlop` where the cutout is visually smaller than that.

**Never:** item detail/edit/delete (Story 2.4) — grid cells are visually complete but not tappable to anything yet, mirroring 2.1's own "no browse UI here" boundary in reverse; pagination or infinite scroll — Phase 1 loads the full non-deleted set in one query; a new `ImageStore` abstraction (NFR8/Epic 6, per 2.1's precedent) — signed URLs go through the Supabase client directly; text search or server-side/AI category detection — chip-based filtering only; a new Zustand store — filter selection is transient single-screen state (`useState`), Zustand stays reserved for the capture/review flow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | User has N non-deleted items | Grid renders all as thumbnails, total count shown | N/A |
| Filter tap | Grid showing all, tap "Shoes" chip | Grid narrows to `category = 'shoes'` only, chip shows selected state | N/A |
| Filter, zero matches | Tap a category with no items | Grid area shows a "no items in this category" message, chips stay usable | N/A |
| No items at all | Zero non-deleted rows | Empty state "Add your first item." replaces the grid, no chips shown | N/A |
| Query fails | Supabase read errors (no connection) | Existing `ConnectionErrorNotice` shown with retry, which re-runs the query | reuse block-and-keep no-connection copy |
| Pull-to-refresh | Populated grid, user pulls down | Query refetches in place, no full-screen loading flash | N/A |
| Partial signed-URL failure | Bulk `createSignedUrls` errors for a subset of paths | Those cells show a broken-image fallback; rest of grid renders normally | N/A |

</frozen-after-approval>

## Code Map

- `app/(tabs)/wardrobe.tsx` -- replace placeholder body with grid/filter/empty/loading/error states; keep the existing `itemAdded` ack effect and "Add item" button as-is above the grid.
- `lib/wardrobe/listItems.ts` (new) -- `useWardrobeItems()`: TanStack Query hook, `queryKey: ['wardrobeItems', userId]`, selects `wardrobe_items` where `user_id` and `deleted_at is null`, ordered `created_at desc` -- mirrors `lib/profile/avatarUrl.ts`'s `useQuery` shape.
- `lib/wardrobe/thumbnailUrls.ts` (new) -- `useThumbnailUrls(paths)`: bulk `supabase.storage.from('wardrobe').createSignedUrls(paths, expirySeconds)`, keyed by path, reusing `avatarUrl.ts`'s `SIGNED_URL_EXPIRY_SECONDS` convention.
- `lib/wardrobe/addItem.ts` -- reuse exported `WardrobeItemCategory` for filter chip values (no changes).
- `components/wardrobe/CategoryFilterChips.tsx` (new) -- controlled chip row (`selected`, `onSelect`).
- `components/ConnectionErrorNotice.tsx`, `components/ui/Text.tsx`, `components/ui/Button.tsx`, `lib/theme/colors.ts` -- reuse as-is (no new tokens/primitives needed).
- `supabase/migrations/0003_wardrobe_items.sql`, `supabase/tests/rls.test.ts` -- no changes; SELECT RLS + the `(user_id) where deleted_at is null` partial index and cross-user isolation test already cover this story's read pattern.

## Tasks & Acceptance

**Execution:**
- [x] `lib/wardrobe/listItems.ts` + `__tests__/listItems.test.ts` -- add `useWardrobeItems()` and a pure `filterByCategory()` helper, test the helper against the I/O matrix's filter/zero-match cases -- deterministic logic, test before wiring into UI.
- [x] `lib/wardrobe/thumbnailUrls.ts` + `__tests__/thumbnailUrls.test.ts` -- add `useThumbnailUrls()`, test the path→URL mapping and partial-failure fallback.
- [x] `components/wardrobe/CategoryFilterChips.tsx` + `__tests__/categoryFilterChips.test.tsx` -- render/selection behavior in isolation.
- [x] `app/(tabs)/wardrobe.tsx` -- wire grid + chips + empty/loading/error states.
- [x] `__tests__/wardrobeGrid.test.tsx` -- render tests: empty state, populated grid, filter narrowing, zero-match filter, connection error + retry, pull-to-refresh -- covers epics.md's AC and every I/O matrix row directly.

**Acceptance Criteria:**
- Given the grid has loaded once, when the user pulls to refresh, then the query refetches without a full-screen loading flash.
- Given a screen-reader user reaches a grid cell, then it announces the item's category (and name if present) as its accessible label.

## Implementation Notes

- `CATEGORY_OPTIONS` (value+label pairs) was inline/local to `app/add-item.tsx`, not exported -- moved it into `lib/wardrobe/addItem.ts` as an exported const and updated `add-item.tsx` to import it, so the filter chips and the add-item category selector can't drift apart. Small edit to 2.1's in-review file; only the constant moved, no other logic touched.
- Extracted two small presentational components not explicitly named in the Code Map, per the spec's own Design Notes ("extract if it grows past ~150 lines"): `components/wardrobe/WardrobeGridCell.tsx` (thumbnail + accessibility label, not tappable per the Never-boundary) and `components/wardrobe/WardrobeGridSkeleton.tsx` (loading placeholder grid).
- `useThumbnailUrls`' paths are computed from the full unfiltered item list, not the filtered `visibleItems` -- confirmed this avoids a new signed-URL fetch on every filter-chip tap for thumbnails already on screen.
- FlatList uses its built-in `refreshing`/`onRefresh` props rather than a custom `refreshControl` element -- `fireEvent(node, 'refresh')` in RNTL only reaches the built-in prop path, and it's the simpler API for this case anyway.
- Confirmed via `node_modules/react-native-css-interop/src/runtime/components.ts` that nativewind's `contentContainerClassName` (ScrollView, FlatList) and `columnWrapperClassName` (FlatList) are real, supported interop props, not an invented convention.
- All tests import via `jest.mock('@/lib/supabase', ...)` (or mock the hook module directly) -- any module that transitively imports `lib/supabase.ts` pulls in `@react-native-async-storage/async-storage`'s native module, which throws under plain Jest without this, matching the existing pattern in `__tests__/avatar.test.ts`.
- Screen-level render tests (`__tests__/wardrobeGrid.test.tsx`) use `await render(...)`, matching this codebase's existing convention (e.g. `signInScreen.test.tsx`) -- omitting `await` produces a `` `render` function has not been called `` error from `@testing-library/react-native`'s `screen` proxy.
- Post-review patches (see Review Triage Log): added a `useFocusEffect`-driven `refetch()` in `wardrobe.tsx` so the grid reflects a just-added item on return from `add-item.tsx` (Expo Router's `dismissTo` returns to an already-mounted tab, so TanStack Query's mount-time refetch never fired on its own); rendered `{header}` in the error branch too; added Sentry reporting for `useThumbnailUrls` failures (mirroring the existing `useWardrobeItems` pattern); normalized the `thumbnailUrls` query key to a sorted array; added `testID`s (`wardrobe-thumbnail-image` / `wardrobe-thumbnail-fallback`) to `WardrobeGridCell` for the new placeholder-rendering test; added tests for the unknown-error message, singular "1 item" copy, the thumbnail placeholder fallback, the new Sentry reporting path, and focus-triggered refetch.

## Spec Change Log

## Review Triage Log

Four parallel layers ran against the diff since baseline: Blind Hunter (9 findings), Edge Case Hunter (4 findings), Verification Gap Reviewer (3 findings), and a security-focused pass (0 blocking, 2 informational). Overlapping findings from different layers are merged into one row below where they share a root cause.

- **Newly added item doesn't appear in the grid without a manual pull-to-refresh** (blind-hunter) — `high` — confirmed: `app/add-item.tsx` has no `invalidateQueries` call after save, and nothing in the app wires focus- or mount-based refetching (no `useFocusEffect`, no focus/online manager anywhere). `router.dismissTo` returns to the already-mounted Wardrobe tab, so TanStack Query's mount-time refetch never fires — a user can see "Item added." and still be looking at the old (possibly empty) grid. Route: `patch` — add a `useFocusEffect` in `wardrobe.tsx` that calls `refetch()`.
- **Error state hides the "Add item" entry point and the "Item added." ack** (blind-hunter + edge-case-hunter, same root cause) — `medium` — confirmed: the `isError` branch doesn't render `header`, so a load failure removes the only way to add an item until it clears. Route: `patch` — render `{header}` in the error branch too.
- **`useThumbnailUrls` failures are silent — no retry, no Sentry visibility** (blind-hunter + edge-case-hunter, same root cause) — `medium` — confirmed: only `data` is read from `useThumbnailUrls`; a total failure silently degrades every cell to its placeholder with no path to notice or recover, unlike the sibling `useWardrobeItems` error handling added in this same diff. Route: `patch` — destructure `isError`/`error` and report via `Sentry.captureException`, matching the existing pattern in the same file.
- **`thumbnailUrls` query key is the raw, unsorted paths array** (blind-hunter) — `low` — confirmed: `items` gets a new array reference on every refetch (including a no-op pull-to-refresh), so every pull-to-refresh re-requests signed URLs for every item even when nothing changed. Fix is a trivial one-line normalization, so not rejected despite low severity. Route: `patch`.
- **Unknown-error branch (`UNKNOWN_ERROR_MESSAGE`) has no covering test** (verification-gap) — `medium` — the existing error-state test only exercises the connection-error path; a regression collapsing all errors to `NO_CONNECTION_MESSAGE` would ship undetected. Route: `patch` — add a non-network-error test case.
- **Singular item-count copy ("1 item") has no covering test** (verification-gap) — `low` — trivial fix. Route: `patch`.
- **Partial signed-URL failure fallback isn't asserted at screen/component level** (blind-hunter + edge-case-hunter, same root cause) — `low` — the fallback ternary in `WardrobeGridCell` is correct, but nothing asserts it renders when a thumbnail URL is `null`; the Tasks list's claim that every I/O-matrix row is covered "directly" is inaccurate for this one row (only the pure `toThumbnailUrlMap` mapping is tested). Route: `patch` — add one assertion.
- **Sentry capture for unknown wardrobe-load errors has no covering test** (verification-gap) — mirrors the identical, equally-untested pre-existing `Sentry.captureException` pattern in `app/add-item.tsx`; no Sentry-mocking test convention exists anywhere in the repo, and adding one only for this story would be inconsistent. Route: `defer`.
- **No pagination/limit on the wardrobe read or bulk signed-URL request** (blind-hunter) — `false` — the frozen Boundaries explicitly state "Never: pagination or infinite scroll — Phase 1 loads the full non-deleted set in one query." A deliberate, already-approved Phase-1 boundary, not a defect in this diff.
- **Grid column count is hardcoded, not responsive to tablet/landscape; `key={GRID_COLUMNS}` is dead code** (blind-hunter) — `false` — EXPERIENCE.md: "Phone-only, no tablet-specific layout in Phase 1 ... portrait only (the Fit canvas and grids are not designed for landscape)." Tablet/landscape support is out of scope for the whole product in Phase 1, not just this story.
- **`!userId || isLoading` guard could strand a logged-out user on an endless skeleton** (blind-hunter) — `false` — `app/(tabs)/_layout.tsx` already redirects to `/(auth)/welcome` whenever `session` is null (with its own loading spinner), before the Wardrobe screen ever mounts; this state is unreachable.
- **`cellSize` could go to zero/negative on a very narrow screen** (edge-case-hunter) — `false` — the app is phone-only/portrait-only (EXPERIENCE.md); no supported device has a logical width below the ~48pt threshold this would require.
- **Inline `renderItem` + unmemoized `WardrobeGridCell`** (blind-hunter) — `low`, rejected — at Phase-1 wardrobe sizes (no pagination, tens of items) this re-render cost is imperceptible; memoizing here optimizes for a scale this story doesn't target yet.

## Design Notes

- 3-column grid (no existing column-count precedent in DESIGN.md); `{spacing.2}` (8px) gaps per DESIGN.md. Plain `FlatList` with `numColumns={3}` -- no FlashList/new dependency needed at Phase-1 item counts.
- Category order matches `add-item.tsx`'s `CATEGORY_OPTIONS`: top, bottom, shoes, outerwear, accessory, with "All" first.
- Bulk `createSignedUrls` (plural) is a distinct Supabase Storage API from `avatarUrl.ts`'s single `createSignedUrl` -- one call for every visible thumb path instead of N requests.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no type errors.
- `npm test -- listItems thumbnailUrls wardrobeGrid CategoryFilterChips` -- expected: all new unit/render tests pass.

**Manual checks (if no CLI):**
- On a physical device/simulator with a few items already saved (via the 2.1 flow): open Wardrobe, confirm grid + count render; tap each filter chip and confirm narrowing; pull-to-refresh; delete all items via SQL and confirm the empty state appears.
