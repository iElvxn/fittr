---
title: 'Story 6.2: Small WebP Fit Cover Thumbnails'
type: 'feature'
created: '2026-10-19'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
baseline_commit: '81c73e6da3f2510c2fd4c3a51309d314975b5568'
context: []
depends_on: ['6-1-cache-storage-images-by-path']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A Fit's cover is a full-resolution PNG (`captureRef` at `quality: 1`, `app/new-fit.tsx:229`), and every small surface downloads that same full file. These are the My Fits grid, Home's week strip, the Planner's day rows, month grid and day sheet, and Item detail's Fits strip. It costs data, storage egress and decode time on the screens users open most.

**Approach:** Each save also uploads a small WebP thumbnail of the cover, stored in a new nullable `fits.cover_thumb_path`. Small surfaces show the thumbnail when there is one and fall back to the full cover otherwise. Fit detail, the Home tile and Share keep the full cover.

## Boundaries & Constraints

**Always:**
- The thumbnail is made on-device from the captured PNG, with the existing `resizeLongEdge` pipeline (`lib/wardrobe/processImage.ts`). It is WebP, keeps transparency, and uses an 800px long edge (decided in review: the collage is taller than 3:4, so a grid tile is height-bound at ~259pt on the largest phones, and 3x needs ~780px; 600px would be ~2.3x and visibly softer).
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

- `lib/wardrobe/processImage.ts:58` -- `resizeLongEdge` is private; export it unchanged (no behavior change for item capture).
- `app/new-fit.tsx` -- `PendingSave` (:40) gains `ts: number` and `thumbUri: string`. `handleSavePress` (:242) sets `ts: Date.now()` and makes the thumb right after `captureRef` (`resizeLongEdge(collageUri, FIT_COVER_THUMB_LONG_EDGE, SaveFormat.WEBP)`), inside the existing try so a thumb failure takes the existing capture-error path. `handleConfirmSave` (:260) passes `ts`/`thumbUri` and `editingFit?.cover_thumb_path ?? null` to `insertFit`.
- `lib/fits/saveFit.ts` -- add `FIT_COVER_THUMB_LONG_EDGE = 800`. `uploadCover(userId, fitId, ts, collageUri, thumbUri)` → `{ coverPath, thumbPath }`, both uploads in parallel and removed together on any failure (copy `uploadItem`'s shape in `lib/wardrobe/addItem.ts:50-72`; keep the no-connection mapping). `insertFit` takes `thumbPath` and `previousThumbPath`, writes `cover_thumb_path`, `rollbackCover` removes both, and the post-commit cleanup removes every previous path that is non-null and not one of the new pair, in one `remove([...])`.
- `lib/fits/listFits.ts` -- `FitRow.cover_thumb_path: string | null`, add to the select, and export `fitThumbPath(fit) => fit.cover_thumb_path ?? fit.cover_path` (the one fallback rule every small surface uses).
- `supabase/migrations/0015_fits_cover_thumb_path.sql` (new) -- `add column cover_thumb_path text`, named constraint `fits_cover_thumb_path_check`: `cover_thumb_path is null or cover_thumb_path ~ ('^' || user_id::text || '/fits/' || id::text || '/cover-[0-9]+_thumb\.webp$')`, plus a column comment. Name the constraint explicitly (0007's lesson: inline checks auto-name).
- Signing sites (the hooks live here, not in the leaf components): `app/(tabs)/fits.tsx:151,252-257`, `app/(tabs)/planner.tsx:280,509`, `components/wardrobe/ItemFitsStrip.tsx:30,42,68` sign/look up `fitThumbPath(fit)`. `app/(tabs)/index.tsx:151` signs every Fit's `fitThumbPath` **plus** `todayFit.cover_path`, since `TodayFitCard` (:332) keeps the full cover.
- Leaf components that look up the map / pass `path` to `StorageImage`: `components/home/WeekStrip.tsx:54-74`, `components/planner/PlannerDayRow.tsx:110-115`, `components/planner/PlannerMonthGrid.tsx:140-143,196-203`, `components/planner/PlanDaySheet.tsx:157,172,191-218`, `components/planner/DayFitHeader.tsx:59-62`, `components/planner/WearPhotoSection.tsx:120-121`. `FitsGridCell` itself needs no change (it takes `thumbnailPath`).
- Do not change: `app/fit/[id].tsx`, `components/home/TodayFitCard.tsx`, `lib/fits/shareFit.ts`, `lib/fits/deleteFit.ts` (soft delete; Storage untouched today).

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/saveFit.test.ts` -- pair paths share `ts`; thumb failure removes both and rethrows (no-connection → `FitError`); row write failure removes both; post-commit deletes old cover + old thumb, skips nulls; same-`ts` retry hits the same paths.
- [x] `__tests__/listFits.test.ts` -- select includes `cover_thumb_path`; `fitThumbPath` fallback.
- [x] `__tests__/newFit.test.tsx` -- save passes the pending `ts` and thumb URI; a retry reuses them.
- [x] `__tests__/fits.test.tsx`, `home.test.tsx`, `planner.test.tsx`, `itemDetail.test.tsx` -- a Fit with a thumb renders/signs the thumb path; one without falls back to `cover_path`; Home's today card still uses `cover_path`. Update existing fixtures with `cover_thumb_path: null`.
- [x] `supabase/tests/rls.test.ts` -- valid thumb path accepted, a path under another Fit's folder rejected.
- [x] `supabase/migrations/0015_fits_cover_thumb_path.sql` -- the column, check and comment.
- [x] `lib/wardrobe/processImage.ts`, `lib/fits/saveFit.ts`, `lib/fits/listFits.ts`, `app/new-fit.tsx` -- make, upload and save the pair.
- [x] the signing sites and leaf components above -- prefer the thumbnail.

**Acceptance Criteria:**
- Given a newly saved Fit, when the My Fits grid loads, then it signs and downloads the `_thumb.webp` path, not the PNG.
- Given a save that fails after the cover upload and is retried, when the retry succeeds, then the bucket holds exactly one cover/thumbnail pair for that save.
- Given `supabase db reset`, when run, then the migration applies cleanly and existing rows validate.
- Given Fit detail, the Home today card or Share, when shown, then they still use `cover_path`.

## Implementation Notes

- Implemented as mapped; typecheck, lint and the full jest suite pass (73 suites passed, `supabase/tests/rls.test.ts` skipped: no local Supabase credentials).
- Added `testID="home-week-cover-{date}"` to the week strip's image for the Home test; no visual effect.
- Home dedupes today's cover against the thumb list, so a pre-thumbnail today Fit is signed once.
- Matrix audit added `fitDetail.test.tsx` "keeps the full cover … even when the Fit has a small thumbnail" (the Detail/Share row had no test with a thumbnail present).
- Verified after review: the human applied `0015` to the dev project; the RLS suite with `.env.local` passed 32/32 (incl. the new thumb-path case). Without `0015` both saves and every Fits list fail (`getFits` selects the column), so it must be applied before the client ships. Device: a new save stored a 1.89 MB PNG and a 34 KB WebP (~56x smaller); grid, week strip and Planner look as sharp as before.

## Spec Change Log

- **Loop 1 (intent_gap, triage #2):** a reviewer showed 600px is ~2.3x, not 3x, because the grid tile is height-bound (~259pt). The human chose 800px; the frozen Always rule, the Code Map constant and the WearPhotoSection note were amended. Known-bad state avoided: tiles softer than before on 3x phones, against the intent's "as sharp as before" check. KEEP: the whole existing implementation (pair upload, ts in pending save, `fitThumbPath`, signing sites, migration, tests); by the human's choice the code is kept, not reverted, and only the constant and the tests that pin it change.

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge | `uploadCover`'s `Promise.all` rolls back while the sibling upload is still in flight, so it can land after `remove` and orphan | low | Real race (`saveFit.ts` uploadCover); a same-`ts` retry overwrites it, an abandon leaves one orphan. `allSettled` is a direct fix | patch |
| 2 | blind | 600px is ~2.3x, not 3x, for the grid tile's height | medium | Canvas is taller than 3:4, so `contain` is height-bound: 194pt tile × 4/3 ≈ 259pt × 3 ≈ 777px. The 600px value and the "sharp at 3x" rationale both sit inside the frozen intent | intent_gap |
| 3 | blind, edge | check doesn't tie the thumb's version to `cover_path`; a pre-6.2 build editing a Fit leaves a stale thumb | low | Reachable only from a pre-6.2 build editing a Fit (pre-launch, Story 6.11 still ahead). A trigger or cross-column check adds complexity and would break old-build saves | reject |
| 4 | blind, edge | Close the sheet after a failed offline save → the pair is orphaned | low | Pre-existing (the cover alone was orphaned the same way before); offline rollback failing isn't new | defer |
| 5 | blind, edge | Lost upsert response / failed `fit_items` → rollback deletes files the committed row points at | medium | Pre-existing `insertFit` rollback design; this change only extends it to the thumb. A same-`ts` retry now restores the exact paths | defer |
| 6 | blind | Local WebP per Save tap never deleted | low | Same as the captured PNG today; cache dir is OS-purgeable; fix adds cleanup logic | reject |
| 7 | blind | spec status ≠ sprint-status | false | Workflow-managed: sprint status is synced at presentation | reject |
| 8 | blind | spec `created` overwritten | low | Fix is a spec edit | reject |
| 9 | blind | Rollout note understates: without 0015, `getFits` fails too, so every Fits list errors | medium | True (`listFits.ts` selects `cover_thumb_path`). Fix is a spec edit, so it's surfaced to the human instead | reject (surfaced) |
| 10 | blind, verif-gap | Month grid, day sheet picker/header, WearPhotoSection have no thumbnail test | medium | Confirmed: every planner fixture has `cover_thumb_path: null`; a revert to `cover_path` blanks those tiles with no failing test | patch |
| 11 | blind | No newFit edit-mode case with `cover_thumb_path: null`; no rls cross-user thumb case | low | `saveFit.test` covers null previous thumb; the regex is user-anchored like cover's | reject |
| 12 | blind | newFit mock hard-codes `FIT_COVER_THUMB_LONG_EDGE: 600` | low | Test would keep passing on a constant change; `requireActual` is a direct fix | patch |
| 13 | blind | `Promise.resolve(remove())` wrapper | false | Matches the existing `rollbackOrphanedFit` idiom in the same file | reject |
| 14 | blind, verif-gap | migration/RLS tests not run | medium | True (Docker down); fix is running them, which is not possible here, so it's surfaced | reject (surfaced) |
| 15 | edge | thumb set but object missing → blank, no cover fallback | low | Same outcome as a missing cover before; fallback by null column is what the intent specifies | reject |
| 16 | verif-gap | 800px not pinned: the newFit assertion compares the constant with itself | medium | Confirmed: `requireActual` makes `newFit.test.tsx` tautological; nothing else references the value. Reverting to 600 passes | patch |
| 17 | blind, edge, verif-gap | migration 0015 header still says "600px long edge" | low | Confirmed at `0015_fits_cover_thumb_path.sql:4`; direct correction | patch |
| 18 | blind | both uploads fail → cover's generic error wins over thumb's no-connection | low | `results.find` picks the cover first; offline usually fails both as no-connection, so the mixed case is rare, and the fix adds a branch | reject |
| 19 | blind | no screen-level retry-after-`insertFit`-failure test | low | Same code path as the tested retry: `pendingSave` (fitId/ts/thumbUri) is reused whichever call failed | reject |
| 20 | blind | no "no thumb → cover" test on the Planner/sheet/strip surfaces | low | The fallback lives only in `fitThumbPath` (tested); a site would have to bypass it to regress | reject |
| 21 | blind | editing a pre-6.2 Fit has no screen-level test | low | carried #11 | reject |
| 22 | blind | WearPhotoSection image lacks `accessibilityLabel=""` | false | Pre-existing; its parent View is `accessible` with a label, so the image is grouped, not announced separately | reject |
| 23 | blind | version not tied to cover_path in the check | low | carried #3 | reject |
| 24 | blind | RLS cross-user / non-numeric version cases; tests not run | medium | carried #11 / #14 | reject (surfaced) |
| 25 | blind | spec created date / status vocabulary | low | carried #7 / #8 | reject |
| 26 | blind | doc comments list surfaces inconsistently | low | Cosmetic; no caller affected | reject |
| 27 | blind | duplicated url-lookup expression; suggest `fitThumbUrl` | low | Refactor adds public surface; the fallback rule itself is single-sourced | reject |
| 28 | blind | test files mock Supabase differently | low | Test-only setup noise, no named harm | reject |
| 29 | blind | rollout note still says only saves fail | medium | carried #9 (spec edit), surfaced | reject (surfaced) |
| 30 | edge | close sheet after failed offline save → orphan pair | low | carried #4 | defer |
| 31 | edge | rollback `remove` hanging offline delays the error | low | Pre-existing (the cover rollback was awaited the same way); supabase-js fails fast offline | reject |
| 32 | edge | `editingFit` gone at confirm (soft-deleted by rollback, then refetched) → old pair never deleted | low | Pre-existing: `previousCoverPath` already came from `editingFit` at confirm; the only harm is orphaned Storage | reject |

## Design Notes

- Thumb is made at capture (Save tap), not at confirm: the retry then reuses the same local file, and a resize failure surfaces as the existing "couldn't capture" error before any upload.
- `WearPhotoSection` (not named in the intent) also takes the thumb: it renders ~half the sheet width (~170pt wide, ~227pt tall, so ~680px at 3x), inside 800px, and it reads the same Planner/Home map, so signing only thumbs there keeps one path per Fit.
- `fitThumbPath` is the single fallback rule; no surface writes `cover_thumb_path ?? cover_path` itself.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device: save a Fit, compare the Storage sizes of cover and thumbnail, and check the grid and Planner cells look as sharp as before in light and dark.
