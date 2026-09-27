---
title: "Story 5.7: Swipe Between Today's Photo and the Fit on Home"
type: 'feature'
created: '2026-09-27'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On Home, today's wear photo is a small thumbnail row under the buttons, while the big tile always shows the collage. The photo of what was actually worn is the more interesting thing, but it's the easiest to miss.

**Approach:** When today's wear has a photo, the big 3:4 tile becomes a two-page swipe: the photo first, then the Fit's collage. Two small square markers under the tile show the page. The "Today's photo" row goes.

**Decisions (user-approved):**
- **Swipe, not an inset.** A plain horizontal paging swipe that snaps to each page, with no parallax, zoom or autoplay. This is the one approved exception to EXPERIENCE.md's "no carousels".
- **Minimal.** No labels, captions, badges or overlays on the tile. Two 5px squares 6px apart, centred 10px under the tile: the current page filled in ink, the other outlined in secondary ink. This matches the approved P6 mockup.
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
- [ ] `__tests__/home.test.tsx` -- write the tests first, one or more per matrix row. Drive swipes with `fireEvent(scrollView, 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: width } , layoutMeasurement: { width } } })`, and give pages and markers testIDs. Rewrite the tests for the removed "Today's photo" row.
- [ ] `components/home/TodayTilePager.tsx`, `components/home/TodayFitCard.tsx`, `app/(tabs)/index.tsx`, `lib/fits/wearRef.ts` -- the pager, removing the row, loading the full-size photo and resetting on focus.

**Acceptance Criteria:**
- Given a photo in light or dark mode, when Home opens, then the tile, markers and spacing match the P6 artboards.
- Given the largest Dynamic Type size on an SE-width screen, when Home opens, then the tile and markers keep their size and nothing clips.
- Given VoiceOver, when focus moves across the tile, then each page reads its label and position.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device: add a photo from Home, swipe between the pages, tap each page, leave Home and come back, and undo a wear with a photo. Check that the photo is sharp on the big tile.
