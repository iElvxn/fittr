---
title: 'Redesign v2 Phase 2: My Fits'
type: 'feature'
created: '2026-09-24'
status: 'done'
route: 'dispatch'
baseline_commit: 'c0bd560de7ccef1b3db5514b0199bbca4f236264'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** My Fits still has the pre-v2 look: a small title header, plain text states, and covers in tiles whose height depends on the image. It doesn't match the redesigned My Closet next to it.

**Approach:** Rebuild the Fits tab to match the approved mockup (P2 artboards, https://claude.ai/artifact/PDK6UMqaS7gpozd844FxWj). It reuses the Phase 0 tokens and Phase 1's patterns: the header, the prose states and the ink banner.

**Decisions (user-locked):**
- **Grid:** 2 columns of equal 4:5 tiles in aligned rows, not masonry. Every cover has the same shape, because the canvas is a fixed flex-1 card.
  - Each tile is `rounded-lg` and filled with the Fit's `canvas_background_color`, or `surface-raised` when that is null.
  - The cover is contained inside the tile and never cropped.
  - The existing favorite heart stays in the top-right corner, and its toggle behavior is unchanged.
- **Under each tile:**
  - Line 1: the Fit name in the Newsreader serif.
  - Line 2: a `caption` reading "Worn n×" (n > 0), or "Saved {Mon D}" from `updated_at` for a Fit that has never been worn.
  - No item count, and no search.
- **Header:** a `caption` count ("8 Fits", "1 Fit") over a `display` "My Fits", with the existing `CirclePlusButton` ("New Fit") on the right. It reserves the count's height before data loads, as My Closet does.
- **Chips:** All, Favorites and Worn stay as they are.
- **States:**
  - Loading: a uniform 4:5 skeleton in `surface-tile`.
  - No Fits: *No Fits yet.* in italic serif, then "Put pieces from your closet together on the canvas, then save the looks you'd actually wear.", then a primary "Build your first Fit" button that goes to `/new-fit`. No chips.
  - Empty filter:
    - Favorites: *No favorites yet.* / "Tap the heart on a Fit to keep it here."
    - Worn: *Nothing worn yet.* / "Mark a Fit as worn from its page and it shows up here, with how often you've worn it."
    - Both show a secondary "Show all Fits" button that resets the filter to All.
  - "Fit saved." becomes an ink banner reading "Fit saved", floating above the tab bar with the Phase 1 closet banner's styling. The existing 2.5s timer and param clearing stay. When it appears, the filter resets to All so the saved Fit is visible.

## Boundaries & Constraints

**Always:**
- Use Phase 0 tokens and type roles only. Text meets WCAG AA and never sits on a tile.
- The wear count comes from the `fit_wears` rows the screen already fetches (`select('fit_id')`). Count them per Fit on the device. No new query and no schema change.
- Keep what works today:
  - refetch on focus;
  - the error notice with Retry, and Sentry reporting;
  - the worn read failing open;
  - the cover placeholder when a URL is missing;
  - the heart's optimistic toggle and rollback;
  - navigation to Fit detail.

**Never:**
- No change to Fit detail, the builder, the tab bar or `fit_wears` writes.
- No masonry and no FlashList here. A plain 2-column `FlatList` is enough.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Worn many | 3 `fit_wears` rows for fit A | A's line 2 is "Worn 3×"; A is in the Worn filter | N/A |
| Never worn | no rows for fit B, updated_at 2026-09-21 | line 2 "Saved Sep 21" (locale short month + day); B not in Worn | N/A |
| Worn read fails | `fit_wears` query errors | grid renders, every tile shows "Saved …", Worn filter empty | fails open, Sentry unless no-connection |
| No background | canvas_background_color null | tile fill `surface-raised` (light/dark) | N/A |
| No cover URL | cover_path null or unsigned | 4:5 tile with its fill, no image | N/A |
| Empty filter | Favorites with no favorites | *No favorites yet.* + Show all Fits → All | N/A |
| Save ack with filter | filter Worn, returns with fitSaved=1 | banner shows, filter resets to All | N/A |

</frozen-after-approval>

## Code Map

- `app/(tabs)/fits.tsx`: the screen. Rebuild the header, states and banner using the patterns in `app/(tabs)/wardrobe.tsx`:
  - the caption placeholder;
  - `renderScreen`;
  - the `ackSeen` render-time reset (`react-hooks/set-state-in-effect` forbids doing it in an effect);
  - the italic serif via `Newsreader_400Regular_Italic`.

  Keep the `FlatList` with `numColumns={2}`, gutter 16, column gap 10, row gap 18, and `testID="fits-grid"`. Replace `FILTER_EMPTY_COPY` with the new title and body copy.
- `lib/fits/wornFitIds.ts`: `getWornFitIds` becomes `getFitWearCounts(userId): Promise<Map<string, number>>` from the same query, and the hook becomes `useFitWearCounts`.
  - **Keep the query key `['wornFitIds', userId]`**, because `app/fit/[id].tsx:195` invalidates it after "Wear today".
  - Leave `getTodayWornFitIds`/`useTodayWornFitIds` untouched.
- `components/fits/FitsGridCell.tsx`:
  - Fixed 4:5 height (`columnWidth * 1.25`), `contentFit="contain"`.
  - Fill from a new `backgroundColor: string | null` prop, falling back to `bg-surface-raised dark:bg-surface-raisedDark`.
  - Name in `title`-sized Newsreader, either through a `Text` style override or a smaller size. Match the mockup: 17/21 at 2 columns, `numberOfLines={1}`.
  - New `meta: string` prop rendered as `caption` `ink-secondary`.
  - Remove `useImageAspectRatio`. Keep the heart code as it is.
- `lib/theme/useImageAspectRatio.ts`: delete it once `FitsGridCell` stops using it; it has no other users.
- `components/fits/FitsGridSkeleton.tsx`: 4:5 `surface-tile` blocks with two text bars, 2 columns, 3 rows.
- Date format: add a module-level `Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })`, like `app/fit/[id].tsx:34`, and build "Saved {date}" in `fits.tsx` or a small pure helper.
- Tests to update:
  - `__tests__/fits.test.tsx` (ack text, empty and filter copy, header);
  - `__tests__/fitsGridCell.test.tsx` (the aspect-ratio tests become fixed-4:5 and fill tests);
  - `__tests__/wornFitIds.test.ts` (Set → counts).

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/wornFitIds.test.ts`: tests first for `getFitWearCounts`: the counts per Fit, empty rows, and the no-connection error.
- [x] `__tests__/fitsGridCell.test.tsx`: tests first for the fixed 4:5 well, the background fill and null fallback, contain, the name and meta lines, and that the heart toggle still passes.
- [x] `__tests__/fits.test.tsx`: update it and add header count, "Worn n×" vs "Saved Mon D", the worn read failing open, both filter-empty states with Show all Fits, the empty-state button, and the banner resetting the filter.
- [x] Implement `wornFitIds.ts`, `FitsGridCell`, `FitsGridSkeleton` and `fits.tsx`, then delete `useImageAspectRatio.ts`.

**Acceptance Criteria:**
- Given Fits in light or dark mode, when My Fits opens, then it matches the P2 mockup: caption count, serif title with "+", chips, and 2 columns of equal 4:5 color-filled tiles with the heart, serif names and caption lines.
- Given a Fit marked worn from Fit detail, when the user returns to My Fits, then its count has gone up by one.

## Verification

**Commands:**
- `npm run test`: all suites pass.
- `npm run typecheck`: clean.
- `npm run lint`: clean.

**Manual checks:**
- On a device, in light and dark mode:
  - covers sit centered in their tiles with no visible seam against the canvas color;
  - hearts toggle correctly;
  - Worn counts go up after "Wear today";
  - the empty, filter-empty, loading and banner states each appear correctly.

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | verification-gap | `['wornFitIds', userId]` key contract untested on both sides | medium | patch | Pre-verified gap: hook always mocked in `fits.test.tsx`, `fitDetail.test.tsx` has no invalidation assert; a key rename would stale "Worn n×". |
| 2 | verification-gap | Header caption hidden in error state is untested | low | patch | Pre-verified: connection-error test asserts no caption; dropping `!isError` would show "No Fits yet" offline. |
| 3 | verification-gap (other), edge-case | Invalid `updated_at` crashes `Intl.format` | false | reject | `0004_fits.sql:41` `updated_at timestamptz not null default now()`; PostgREST always returns ISO timestamps. |
| 4 | edge-case, blind | >1000 `fit_wears` rows truncated by PostgREST `max_rows` | low | defer | Real at scale; the unbounded `select('fit_id')` is pre-existing and intent forbids a new query. |
| 5 | edge-case, blind | Worn filter shows "Nothing worn yet." when the wear read failed | low | reject | Intent matrix row "Worn read fails" specifies Worn filter empty (fail open); pre-v2 screen behaved the same. |
| 6 | edge-case, blind | Ack banner covers last grid row while shown | low | reject | Only when scrolled to the end, for 2.5s; identical to Phase 1 `wardrobe.tsx:170/293`. Fix adds a branch. |
| 7 | edge-case | Stale `useWornFitIds` comment in `app/fit/[id].tsx:98` | low | patch | Rename made the reference dangling; comment-only correction, no behavior change to Fit detail. |
| 8 | blind | Doc comment claims covers come from a fixed 4:5 canvas | low | patch | `FitCanvas.tsx` canvas is `flex-1`; `contain` + canvas-color fill still makes it seamless, only the comment is wrong. |
| 9 | blind | Null-background covers bake the save-time scheme's `surface-raised`, so they show a seam after a light/dark switch | medium | defer | Real: `FitCanvas.tsx` fills null bg with `bg-surface-raised dark:…` and it is captured; Fit detail (`app/fit/[id].tsx:387-402`) already has the same well+contain behavior, so root cause is pre-existing capture. |
| 10 | blind | "Saved" uses `updated_at` and omits year | false | reject | Intent explicitly specifies "Saved {Mon D}" from `updated_at`. |
| 11 | blind | Save ack doesn't scroll to top | low | defer | `dismissTo` keeps the mounted list's offset; pre-existing before this change. |
| 12 | blind | `accessibilityRole="alert"` not announced by VoiceOver | low | defer | Same pattern in Phase 1 `wardrobe.tsx:168` and the pre-v2 ack; pre-existing. |
| 13 | blind | Cell `accessibilityLabel={name}` hides meta line from screen readers | low | patch | `FitsGridCell.tsx:123` label overrides children; direct fix. |
| 14 | blind | "No Fits yet" caption duplicates the empty-state title | false | reject | Matches the P2 mockup and Phase 1's "No pieces yet" caption (`wardrobe.tsx:150`). |
| 15 | blind | `TILE_HEIGHT_RATIO` duplicated in cell and skeleton | low | patch | Skeleton and real tiles can drift; direct fix via shared export. Query-key duplication covered by #1. |
| 16 | blind | `PixelRatio.getFontScale()` not reactive | low | reject | Same as the shared `components/ui/Text.tsx:21` convention; the name override scales identically to every other Text. |
| 17 | blind | Test gaps (dark mode, extraData, banner over states, `getByText(' ')`, raisedDark on colored path) | low | reject | Cosmetic coverage; the raisedDark claim is false (`not.toContain('bg-surface-raised')` also excludes `bg-surface-raisedDark`). |
