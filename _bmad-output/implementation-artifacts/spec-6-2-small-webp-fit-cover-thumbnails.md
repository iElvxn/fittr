---
title: 'Story 6.2: Small WebP Fit Cover Thumbnails'
type: 'feature'
created: '2026-09-27'
status: 'draft'
route: ''
review_loop_iteration: 0
context: []
depends_on: ['6-1-cache-storage-images-by-path']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Fit's cover is a full-resolution PNG (`captureRef` at `quality: 1`, `app/new-fit.tsx:229`), and every small surface downloads that same full file. These are the My Fits grid, Home's week strip, the Planner's day rows, month grid and day sheet, and Item detail's Fits strip. It costs data, storage egress and decode time on the screens users open most.

**Approach:** Each save also uploads a small WebP thumbnail of the cover, stored in a new nullable `fits.cover_thumb_path`. Small surfaces show the thumbnail when there is one and fall back to the full cover otherwise. Fit detail, the Home tile and Share keep the full cover.

## Boundaries & Constraints

**Always:**
- The thumbnail is made on-device from the captured PNG, with the existing `resizeLongEdge` pipeline (`lib/wardrobe/processImage.ts`). It is WebP, keeps transparency, and uses a 600px long edge (sharp at 3x in a ~190pt grid cell).
- Path `{userId}/fits/{fitId}/cover-{ts}_thumb.webp`, with the same `{ts}` as its cover. `{ts}` is generated once per save attempt and kept in the pending-save state next to `fitId`, so a retry reuses it; today `uploadCover` calls `Date.now()` on every call (`saveFit.ts:29`) and the pending-save state holds only `fitId`, `collageUri` and `defaultName` (`new-fit.tsx:242`). It is write-once, like the cover (Story 6.1's caching rule), and uses `cacheControl: '31536000'`.
- `saveFit` treats cover + thumbnail as one unit. If either upload fails, nothing is saved and whatever was uploaded is rolled back. After a save commits, the previous cover and its thumbnail are both best-effort deleted. Deletes depend on Story 6.1's `wardrobe_delete_own` policy; without it they do nothing.
- The migration adds `cover_thumb_path text null` with a check constraint mirroring `fits_cover_path_check`'s shape (`0006`). RLS is unchanged, since the column sits on an already-scoped row.
- Existing Fits have no thumbnail and fall back to `cover_path` until their next edit. No backfill.
- Small surfaces go through Story 6.1's `StorageImage` with the thumbnail path as the cache key.

**Never:** no change to how the collage is captured, no server-side image processing, no second format for Share, and no visual change beyond sharpness at the same size.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| New save | Fit saved from the builder | cover PNG + `_thumb.webp` uploaded; row has both paths | N/A |
| Edit | existing Fit re-saved | new pair uploaded; old pair best-effort deleted after commit | cleanup failure ignored, as today |
| Thumb upload fails | cover ok, thumb fails | save fails with the existing no-connection/unknown flow; the uploaded cover is rolled back | a retry keeps the same `fitId` and `{ts}` (both from the pending-save state), so it overwrites its own partial upload rather than leaving a second pair |
| Old Fit | `cover_thumb_path` null | small surfaces show `cover_path` | N/A |
| Detail / Share | any Fit | full cover as today | N/A |

</frozen-after-approval>

## Code Map

- `app/new-fit.tsx:223-275` -- captures the collage and calls `uploadCover` then `insertFit`. Make the thumbnail here or inside `uploadCover`. Add `ts` to `PendingSave` (set with `fitId` at :242) and pass it to `uploadCover`, which stops calling `Date.now()` itself.
- `lib/fits/saveFit.ts` -- `uploadCover` (:29-40, takes `ts` as a parameter), `insertFit` (upsert, `rollbackCover`, `rollbackOrphanedFit`), previous-cover delete (:79). Extend these to handle the pair.
- `lib/wardrobe/processImage.ts:58` -- `resizeLongEdge(uri, longEdge, SaveFormat.WEBP)`. Reuse it; export if needed.
- `lib/fits/listFits.ts` -- `FitRow` and its select. Add `cover_thumb_path`.
- `supabase/migrations/0015_fits_cover_thumb_path.sql` (new) -- column + check + comment, in the style of `0006`. `0014` is Story 6.1's Storage delete policy; if the stories land in a different order, renumber to the next free number.
- Small surfaces that switch to the thumbnail (with fallback): `app/(tabs)/fits.tsx` + `components/fits/FitsGridCell.tsx`, `components/home/WeekStrip.tsx`, `components/planner/PlannerDayRow.tsx`, `components/planner/PlannerMonthGrid.tsx`, `components/planner/PlanDaySheet.tsx`, `components/planner/DayFitHeader.tsx`, `components/wardrobe/ItemFitsStrip.tsx`. Their signing queries collect the thumbnail path instead of `cover_path`.
- Keep the full cover: `app/fit/[id].tsx`, `components/home/TodayFitCard.tsx`, `lib/fits/shareFit.ts`.

## Tasks & Acceptance

**Execution:**
- [ ] `__tests__/saveFit.test.ts`, the listed surface tests, and `supabase/tests` (if the check constraint is covered there) -- pair upload, rollback on thumbnail failure, cleanup of both old files, and thumbnail-or-fallback on each surface.
- [ ] `supabase/migrations/0015_fits_cover_thumb_path.sql` -- the column.
- [ ] `lib/fits/saveFit.ts`, `app/new-fit.tsx`, `lib/fits/listFits.ts` -- make, upload and save the thumbnail.
- [ ] the small-surface files -- prefer the thumbnail.

**Acceptance Criteria:**
- Given a newly saved Fit, when the My Fits grid loads, then it downloads the `_thumb.webp` file, not the PNG.
- Given a save that fails after the cover upload and is retried, when the retry succeeds, then the bucket holds exactly one cover/thumbnail pair for that save.
- Given `supabase db reset`, when run, then the migration applies cleanly and existing rows validate.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device: save a Fit, compare the Storage sizes of cover and thumbnail, and check the grid and Planner cells look as sharp as before in light and dark.
