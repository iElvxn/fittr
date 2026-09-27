---
title: "Story 5.5: See a Fit's Wear Photos on Fit Detail"
type: 'feature'
created: '2026-09-27'
status: 'done'
baseline_commit: 'd459bea84332154bffafdd7b92ebed6162793dea'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Wear photos only show on Home (today) and in the Planner, one day at a time. Nowhere shows how a Fit has looked across every time it was worn.

**Approach:** Fit detail gets a "Worn" section between the action row and Items. It's a horizontal strip of that Fit's wear photos, newest first, each dated, and tapping one opens that day in the Planner. When the Fit is worn today and today's wear has no photo, the strip starts with an "Add a photo" tile.

**Decisions (user-approved, P7 mockup):**
- **Strip:** 108×144 (3:4) tiles, 10px apart, 12px corners, no shadow, scrolling sideways past the gutter. It's a plain scroll like Item detail's Fits strip, not a paging carousel.
- **Label:** a plain "Worn" section label, with no count.
- **Dates:** under each tile, in the small uppercase caption style. Today's reads "Today" in primary ink; others read "Sep 19" in secondary ink, with the year added when it isn't this year ("Aug 16, 2025").
- **Tap a photo:** switches to the Planner tab and opens that day's sheet, in whichever view (week or month) the user last chose, on the week or month containing that day.
- **Add a photo:** a dashed tile with a camera icon, dated "Today". It uses Home's flow: source sheet, save, then the tile becomes the photo. While saving, it shows the picked image faded with a spinner and "Saving".
- **No photos and not worn today:** the section is hidden, so Fit detail looks as it does now. Past wears without a photo never show and get no Add (no backfilling).

## Boundaries & Constraints

**Always:**
- Tiles load the 240px thumbnail (`thumbPath`) with the thumbhash placeholder, disk-cached by path.
- Every photo on a Fit shows. There's no cap, and signing is one batch.
- Today's photo follows Fit detail's worn toggle: an undo drops it at once and a failed undo brings it back, as on Home.
- One lock: the wear toggle, Delete and the photo save each block the others.
- Photo errors use Fit detail's existing notice (no-connection, or unknown and reported to Sentry). A failed strip read hides the photos without a notice and is reported. The Add tile still shows when it applies.

**Never:** no schema or storage change, no photo actions on past wears, no replace or remove from Fit detail (that stays in the Planner's day sheet), and no change to Home.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Photos | 3 wears with photos, one today | "Worn" strip, newest first; "Today", "Sep 19", "Sep 11" | N/A |
| Old year | a photo from Aug 16, 2025 | caption "Aug 16, 2025" | N/A |
| Tap photo | tap the Sep 19 tile | Planner tab, Sep 19's day sheet open | N/A |
| Add today | worn today, no photo | dashed Add tile first, then the other photos | N/A |
| Add saves | pick a photo | saving tile; then today's photo leads the strip | offline: notice, Add tile back |
| First wear | worn today, no photos ever | strip with just the Add tile | N/A |
| None | no photos, not worn today | no Worn section | N/A |
| Loading | photos query pending | 4 skeleton tiles | N/A |
| Read fails | photos query errors | photos hidden; Add tile still shows if worn today without a photo | Sentry if unknown, no notice |
| Undo | undo today's wear that has a photo, then confirm | today's tile drops at once | revert restores it |
| Elsewhere | photo removed in the Planner | the strip updates on return | N/A |
| Busy | a save or a wear toggle in flight | Add tile, toggle and Delete ignore taps | N/A |

</frozen-after-approval>

## Code Map

- `lib/fits/fitWearPhotos.ts` (new): `getFitWearPhotos(fitId)` selects `id, worn_on, ${WEAR_PHOTO_COLUMNS}` from `fit_wears` where `fit_id` matches and `photo_path` is not null, ordered by `worn_on` descending. It maps rows with `toWearRef` and classifies errors like `wornFitIds.ts`. The hook `useFitWearPhotos(userId, fitId)` uses the key `['fitWearPhotos', userId, fitId]`.
- `lib/fits/markFitWorn.ts:78` `invalidateWearQueries`: add `'fitWearPhotos'` to its prefixes. Every add, remove and undo path already calls this.
- `components/fits/FitWearPhotosStrip.tsx` (new): model it on `components/wardrobe/ItemFitsStrip.tsx`. It takes the photos, the add, saving and loading states, and callbacks. Signing uses `useWearPhotoUrls` on the thumb paths; images use `WearPhotoImage` (`localUri` for the saving tile); `CameraIcon` for the Add tile. Tile corners are `rounded-md`.
- `app/fit/[id].tsx`:
  - Add `useWearPhotoActions(userId)`, with the section between the error notice (≈513) and Items (≈520), labelled with `SectionLabel`.
  - Today's wear is `todayWornFitIds?.get(fit.id)` (already read, ≈188). Add applies when `isWornToday && todayWear && !todayWear.photo`.
  - Filter today's row out of the strip while `!isWornToday` so it follows the override.
  - Put `photoActions.busy` into the toggle's and Delete's `disabled` values, and `wearBusy` into Add. Route `photoActions.error` into the notice.
  - A photo tap does `router.navigate({ pathname: '/planner', params: { date: worn_on } })`.
- `app/(tabs)/planner.tsx`:
  - Read `date` with `useLocalSearchParams`. It reacts to changes, since the tab stays mounted.
  - When the param is a valid `YYYY-MM-DD`, set `weekStart`/`monthStart` (≈105) to contain it, call `openSheet(date)` (≈339), then clear it with `router.setParams({ date: undefined })`.
  - Ignore an invalid date.
- Reuse: `WEAR_PHOTO_COLUMNS`, `toWearRef`, `WearRef` (`lib/fits/wearRef.ts`), `weekStartOf`/`monthStartOf`, `todayLocalDate`, `ConnectionErrorNotice`.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/fitDetail.test.tsx`, `__tests__/planner.test.tsx`, `__tests__/fitWearPhotos.test.ts` -- tests first, one or more per matrix row, plus the query's filter and order and the planner's `date` param (open, invalid, cleared). Mock `lib/fits/wearPhoto` as `home.test.tsx` does, and keep existing tests passing.
- [x] `lib/fits/fitWearPhotos.ts`, `lib/fits/markFitWorn.ts` -- the query, hook and invalidation.
- [x] `components/fits/FitWearPhotosStrip.tsx`, `app/fit/[id].tsx` -- the strip and its wiring.
- [x] `app/(tabs)/planner.tsx` -- the `date` deep link.

**Acceptance Criteria:**
- Given photos in light or dark mode, when Fit detail opens, then the section matches the P7 artboards.
- Given the largest Dynamic Type size, when Fit detail opens, then tiles keep their size and the date captions don't clip.
- Given VoiceOver, when focus reaches the strip, then each photo reads "Your photo from {Saturday, Sep 19}. Open that day in the Planner", Add reads "Add a photo of what you wore today", and the saving tile reads "Saving your photo".

## Implementation Notes

- Date captions and VoiceOver dates come from two new pure helpers in `lib/planner/week.ts` (`shortDateLabel`, `longDateLabel`), plus `isLocalDate` for the Planner's param check. A photo from another year reads "Your photo from Saturday, Aug 16, 2025. …".
- Planner `date` param: handled during render (the `seenToday` pattern) once the remembered view is known, since `react-hooks/set-state-in-effect` rejects doing it in an effect. An effect then clears the param. A handled-date marker resets when the param clears, so tapping the same photo again later reopens the day.
- `getFitWearPhotos` filters by `fit_id` only (RLS scopes to the owner), as the Code Map says. Rows whose photo is incomplete are dropped.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | verification-gap | No test that a Delete in flight blocks the Add tile | medium | patch | Pre-verified: removing `deleting`/`countingPhotos` from `photoBusy` and the `handleAddPhoto` guard passes every test. |
| 2 | verification-gap | No test that a photo-save error clears when another action starts | medium | patch | Pre-verified: reverting a `clearErrors()` call leaves a stale notice and every test still passes. |
| 3 | blind + edge | Planner `date` handler opens a sheet while a day-sheet write is in flight | medium | patch | `planner.tsx` else-if has no busy check; `closeDaySheet`/`viewFit` refuse while `photoActions.busy`/`wornToday.isBusy()`. `sheetBusy` (≈316) is state-backed, so waiting on it re-renders when writes finish. |
| 4 | blind | Worn label + skeletons flash on Fits never worn | low | reject | Real, but the frozen matrix's Loading row mandates 4 skeleton tiles while the query is pending. |
| 5 | blind | A failed refetch hides photos already loaded | low | reject | RN refetch needs a focus or invalidation after a successful write while offline; rare, and the matrix says a failed read hides the photos. |
| 6 | blind + edge | No cap/virtualization; >1000 rows truncated by PostgREST | low | reject | The intent says "no cap, signing is one batch"; 1000 photo wears of one Fit is years of daily wear. |
| 7 | blind | Adding a photo re-signs every thumbnail | low | reject | Pre-existing `useWearPhotoUrls` key design; one extra batch request per change. |
| 8 | blind | `openSheet` runs during render | false | reject | `openSheet` → `clearError`s + `openDay` are state setters only (`usePlanDayWrites.ts:35`, `useWearPhotoActions.ts:80`). |
| 9 | blind | `handleAddPhoto` skips `clearErrors()`, favorite/share flags | false | reject | `addPhoto` owns its error; the intent's lock covers toggle, Delete and save only. |
| 10 | blind + edge | Sentry reports repeat on each failed refetch | low | reject | Same pattern as the items/list reads in this screen (`[id].tsx:91,97`). |
| 11 | blind | `router.navigate` leaves Fit detail, so back won't return to it | false | reject | The intent specifies switching to the Planner tab via `router.navigate`. |
| 12 | blind | Missing tests: view resolving later, userId undefined, picker cancel, re-worn tile | low | reject | Covered paths: open-with-view tests, `enabled` gate, `useWearPhotoActions` cancel handling predates this story. |
| 13 | blind | Today tile's a11y label says the weekday date, not "Today" | false | reject | The AC defines the label as "Your photo from {Saturday, Sep 19}…". |
| 14 | blind | `supabase/.temp/` not gitignored | low | defer | Pre-existing CLI state, not created by this story. |
| 15 | edge | Photo tap during a Delete; the delete's `router.back()` pops the wrong screen | low | reject | Needs a tap in the brief delete window; the fix adds a guard, and photo taps are outside the intent's lock. |
| 16 | edge | Photo tiles have no disabled state while busy | low | reject | Same root as 15; leaving mid-save finishes the save. |
| 17 | edge | After midnight, stale `todayWornFitIds` lets Add attach to yesterday's wear | medium (unverified scope) | defer | `todayWornFitIds` key has no date and Fit detail has no day-rollover refresh; pre-existing staleness that already drives the worn toggle. |
| 18 | edge | `date` param may arrive as `string[]` | false | reject | The only producer passes a single string (`handleOpenWearDay`). |

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device: open a Fit with several wear photos, scroll the strip, and tap an old one (the Planner opens on that day's sheet). Mark a Fit worn from Fit detail, add a photo, then undo with it. Remove a photo in the Planner and come back.
