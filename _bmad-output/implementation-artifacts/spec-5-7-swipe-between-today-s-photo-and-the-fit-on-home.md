---
title: "Story 5.7: Swipe Between Today's Photo and the Fit on Home"
type: 'feature'
created: '2026-09-27'
status: 'done'
route: 'dispatch'
baseline_commit: '0f35d0ded0e4a700e7d3d302a5eea07c3b4be933'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On Home, today's wear photo is a small thumbnail row under the buttons, while the big tile always shows the collage. The photo of what was actually worn is the more interesting thing, but it's the easiest to miss.

**Approach:** When today's wear has a photo, the big 3:4 tile becomes a two-page swipe: the photo first, then the Fit's collage. Two small round markers under the tile show the page. The "Today's photo" row goes.

**Decisions (user-approved):**
- **Swipe, not an inset.** A plain horizontal paging swipe that snaps to each page, with no parallax, zoom or autoplay. This is the one approved exception to EXPERIENCE.md's "no carousels".
- **Minimal.** No labels, captions, badges or overlays on the tile. Two 5px circles 6px apart, centred 10px under the tile: the current page filled in ink, the other outlined in secondary ink. This matches the approved P6 mockup, except the markers are round (changed by the user after implementation).
- **Photo first, every time.** Home opens on the photo each time it comes back into focus, and again whenever the photo changes.
- **Taps:** the photo opens today's day sheet (to replace or remove it), and the collage opens Fit detail.
- **No photo, or today not worn:** the tile is the collage alone with no markers, exactly as now. "Add a photo" stays under the buttons.

## Boundaries & Constraints

**Always:**
- The photo page shows the full-size photo (`WearPhoto.path`), not the 240px thumbnail. It uses the thumbhash as the placeholder and is cached by path, like the day sheet.
- The pager follows the optimistic toggle. An undo drops the photo page at once (Story 5.6 already clears `todayPhoto` when `!isWornToday`).
- Each page is its own accessible button, labelled "Your photo from today, 1 of 2. Open to replace or remove" and "Open {Fit name}, 2 of 2".

**Never:** no schema or storage change, no new dependency (use React Native's horizontal `ScrollView` with `pagingEnabled`), no change to the Planner or Fit detail, and no pager on the Home day sheet.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Photo | today's planned Fit worn, wear has a photo | tile shows the full photo; two markers, first filled; no "Today's photo" row | N/A |
| Swipe | swipe left on the tile | collage page; second marker filled | N/A |
| Tap photo | tap the photo page | today's day sheet opens | N/A |
| Tap collage | tap the collage page | Fit detail opens | N/A |
| Refocus | swiped to the collage, leave Home and come back | opens on the photo again | N/A |
| No photo | worn, no photo | collage alone, no markers, "Add a photo" under the buttons | N/A |
| Not worn | planned, not worn | collage alone, no markers, no "Add a photo" | N/A |
| Photo added | "Add a photo" saves | tile turns into the pager, on the photo | N/A |
| Undo | tap Worn today on a wear with a photo, then confirm | pager collapses to the collage at once | revert restores the pager |
| Photo loading | full photo's signed URL not ready | thumbhash placeholder on the photo page | N/A |

</frozen-after-approval>

## Code Map

- `components/home/TodayFitCard.tsx`:
  - The big tile becomes the pager when `photo` is set. The collage `Pressable` is unchanged.
  - Delete the "Today's photo" row. Its constants (`PHOTO_THUMB_*`, `PHOTO_HINT_*`) and the `ChevronRightIcon` import go with it.
  - Keep `canAddPhoto` / "Add a photo" as is. `onOpenPhoto` now fires from the photo page.
  - Update the doc comment: the "big tile always keeps the collage" line is reversed.
- `components/home/TodayTilePager.tsx` (new) holds the pager's two pages and the markers, so the card stays readable:
  - Horizontal `ScrollView` with `pagingEnabled`, and page width measured with `onLayout`.
  - The page index updates on `onMomentumScrollEnd`.
  - It resets to page 0 when a `resetKey` prop changes.
- `app/(tabs)/index.tsx`:
  - Sign `todayPhoto.path` (full size) with `useWearPhotoUrls` instead of `thumbPath`, and pass that `url` through `photo`.
  - Pass a `resetKey` that changes on each focus (the existing `useFocusEffect`) and with `todayPhoto.path`.
- Reuse: `WearPhotoImage` (path/url/thumbhash, disk-cached) and `useWearPhotoUrls`.
- `lib/fits/wearRef.ts`: correct the `path` doc comment ("Only the day sheet loads it") to include Home's tile.
- `__tests__/home.test.tsx`: the Story 5.4 tests at about lines 518 and 596 assert the removed row. Rewrite them against the pager.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/home.test.tsx` -- write the tests first, one or more per matrix row. Drive swipes with `fireEvent(scrollView, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: width } , layoutMeasurement: { width } } })`, and give pages and markers testIDs. Rewrite the tests for the removed "Today's photo" row.
- [x] `components/home/TodayTilePager.tsx`, `components/home/TodayFitCard.tsx`, `app/(tabs)/index.tsx`, `lib/fits/wearRef.ts` -- the pager, removing the row, loading the full-size photo and resetting on focus.

**Acceptance Criteria:**
- Given a photo in light or dark mode, when Home opens, then the tile, markers and spacing match the P6 artboards.
- Given the largest Dynamic Type size on an SE-width screen, when Home opens, then the tile and markers keep their size and nothing clips.
- Given VoiceOver, when focus moves across the tile, then each page reads its label and position.

## Implementation Notes

## Spec Change Log

- 2026-09-27: page markers changed from 5px squares to 5px circles at the user's request after reviewing the implementation. They are indicators, not controls, so DESIGN.md's square-controls rule does not apply.

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | gap, blind | The scroll-back to the photo on reset is untested; `scrollTo?.` hides a missing method | medium | Pre-verified: the marker is derived from the key alone, so deleting the reset effect fails no test | patch |
| 2 | gap, edge | Page sizing from `onLayout` is never asserted | low | Pre-verified: removing `setPageWidth(width)` fails no test; the fix is two assertions | patch |
| 3 | gap-other, edge, blind | `focusCount` bumps on every AppState `active`, so Control Center or a Face ID prompt snaps the pager back to the photo | low | index.tsx:98-101 calls `refresh()`, which bumps the count, on inactive→active as well as background→active | patch |
| 4 | edge, blind | Page tracking uses only `onMomentumScrollEnd`; a zero-velocity release on a boundary leaves the marker stale | low | Needs a drag to stop exactly on a page edge with `pagingEnabled`, which is rare; the fix adds a second handler | reject |
| 5 | edge, blind | A width change (rotation, split view) leaves the offset between pages | false | The app is portrait-only on iPhone (epic-5-context UX rules), so the tile's width never changes after layout | reject |
| 6 | edge | VoiceOver moving to page 2 scrolls with no momentum event, so the markers go stale | low | Unverified whether iOS fires momentum end on an accessibility scroll; the pages read "1 of 2"/"2 of 2", so VoiceOver users don't rely on the markers | reject |
| 7 | edge | The photo page can be tapped while an undo is in flight | false | The undo is optimistic: `isWornToday` flips first, `todayPhoto` goes null, and the pager unmounts before the write lands | reject |
| 8 | blind | `GUTTERS = 32` hard-codes Home's gutter token | low | It only sizes the first frame before `onLayout` corrects it; threading the token through adds surface | reject |
| 9 | blind | The full photo shows only the thumbhash while it loads, not the cached thumbnail | false | The frozen Boundaries require the full-size photo with the thumbhash as placeholder | reject |
| 10 | blind | The markers aren't hidden from accessibility; no swipe hint | false | Plain `View`s without `accessible` are not VoiceOver elements; the frozen labels are what the spec asks for | reject |
| 11 | blind | The photo page is a button even when `onOpenPhoto` is undefined | low | Home, the only caller, always passes it (index.tsx:335) | reject |
| 12 | blind | Duplicated `TILE_ASPECT_RATIO` and two sizing methods | low | No caller diverges today; unifying them is a refactor, not a correction | reject |
| 13 | blind | Assorted untested cases (dark-mode classes, undo after a swipe, press during a swipe) | low | Undo remounts the pager on page 0; the rest are styling or platform behaviour | reject |
| 14 | blind | Tests match marker classNames | low | The spec defines the markers by fill and outline; switching to `accessibilityState` changes the component's surface | reject |
| 15 | blind | The patch leaves out the spec and planning changes | false | The review diff deliberately excludes them; the spec goes only to the edge-case layer | reject |

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device: add a photo from Home, swipe between the pages, tap each page, leave Home and come back, and undo a wear with a photo. Check that the photo is sharp on the big tile.
