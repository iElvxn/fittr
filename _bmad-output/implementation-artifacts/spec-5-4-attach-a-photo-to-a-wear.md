---
title: 'Story 5.4: Attach a Photo of the Outfit Actually Worn'
type: 'feature'
created: '2026-09-27'
status: 'done'
route: 'dispatch'
baseline_commit: '99fcee6223f00573bb3994988aab82623006c127'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
  - '{project-root}/.claude/skills/supabase-postgres-best-practices/references/security-rls-performance.md'
  - '{project-root}/.claude/skills/vercel-react-native-skills/rules/ui-expo-image.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A wear is only a date and a collage, so the user can't remember how the outfit actually looked on them.

**Approach:** Let the user attach one real photo to each wear (camera or library), built to the approved Phase 5 boards (P5Photos, P5SheetDark, P5SheetAdd, P5PhotoSource, P5SheetSaving, P5HomeAdd, P5HomePhoto, P5MonthPhotos on https://claude.ai/artifact/PDK6UMqaS7gpozd844FxWj). Cost is kept minimal the way photo apps do it.

**Decisions (user-approved):**
- **Day sheet:** on a worn day, the Planner's day sheet opens with a "Worn · {Fit}" caption. Under it, the photo and the Fit's collage sit side by side at 3:4, with "Replace photo" and "Remove photo" below. With no photo, the photo half is a dashed "Add a photo" slot.
  - Tapping the slot opens the native camera-or-library action sheet.
  - While the photo saves, it shows a veil and "Saving".
- **Home:** once today's Fit is worn, an "Add a photo" action sits under the buttons. With a photo, a row shows a thumbnail, "Today's photo · Replace or remove it in the Planner" and a chevron, and opens today's sheet.
- **Tiles:** a worn day with a photo shows the photo instead of the collage, still with the worn check, in the month grid and the week rows. Home's big tile keeps the collage.
- **Photos only exist on wears.** A photo belongs to one wear (a Fit on a day it was marked worn), never to a Fit or a date alone, and there is one per wear.
  - Today's wear takes a photo from Home or the Planner, and a past wear from that day in the Planner.
  - Planned-but-unworn days, future days, and past days never marked worn can't take one. There's no backfilling, because wears are still only recorded for today.
  - A photo added on any screen is the same photo everywhere.
- **Confirmations:**
  - Removing a photo asks first, with a native confirm ("Remove photo" in destructive style, plus Cancel).
  - Undoing a wear that has a photo (Home, or Fit detail's Worn today) asks "Undo today's wear? Its photo will be deleted." A wear without a photo still undoes in one tap.
- **Deleting a Fit deletes its wear photos.** The wear rows are kept for the streak and history, but their photo columns are cleared and the files deleted. When the Fit has photos, its delete confirmation adds "Its N wear photos will be deleted too." (with "photo" for one).
- **Fit detail stays out of this story.** A follow-up story adds a "Worn" photo strip and "Add a photo" for today's wear on Fit detail.
- **Cost controls (required):**
  1. Never upload the original: resize to 1080px on the long edge as WebP at about 75% quality.
  2. A 240px WebP thumbnail for every tile. Only the sheet loads the full photo.
  3. The disk cache is keyed by the storage path.
  4. Every upload gets a new unique file name, and nothing is overwritten.
  5. No orphaned files: replacing, removing, undoing the wear and account deletion all remove the file.
  6. A thumbhash placeholder is stored on the row.
  7. Only the visible month's thumbnails load.
  8. One photo per wear.
  9. Turning on the spend cap and usage alerts is a launch note.
  10. Photos are measured in the Epic 6 budget check.

## Boundaries & Constraints

**Always:**
- The re-encode strips EXIF, so GPS never uploads.
- Photos go through one module, the future `ImageStore` seam (NFR8).
- The private `wear-photos` bucket's policies confine each user to their own `{uid}/` folder, calling `(select auth.uid())` once rather than per row. It has select, insert and delete policies and no update policy.
- The `fit_wears` update right is **column-level**: the photo columns only, never `worn_on`, so the streak stays trustworthy.
- A save uploads first, then updates the row, and only then deletes the old files. A failed row update deletes the just-uploaded files. A failed old-file delete is reported to Sentry, never shown to the user.
- Errors use the no-connection or unknown-error notices, and the busy guard ignores extra taps.

**Never:**
- Not in this story (planned follow-ups, logged to `deferred-work.md`): server-side resizing (Supabase image transformations, once on Pro), a scheduled Edge Function cleanup for orphaned files, and a move to R2 with Cloudflare Images if downloads become the main cost. Redis isn't planned; the phone's disk cache does that job.
- No photo limit, no wear-date editing, and no Fit-level photo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Add from a worn day | pick a library photo | "Saving", then the photo; the row gets the paths and thumbhash; the tile shows the photo | N/A |
| Replace | new photo | new files, row updated, then old files deleted | old-file delete failure: Sentry only |
| Remove | tap Remove photo, confirm | row photo columns null, files deleted, tile back to collage | N/A |
| Undo a wear that has a photo | tap Worn today, confirm | wear and photo files deleted; Cancel leaves both | N/A |
| Delete a Fit with photos | confirm the delete | Fit soft-deleted; its wears keep `worn_on` but lose the photo columns; files deleted | file delete failure: Sentry only |
| Unworn day | a planned, not-worn day's sheet | no photo section | N/A |
| Save offline | no connection | photo unchanged, no-connection notice | nothing orphaned |
| Row update fails | upload OK, update errors | uploaded files deleted, old photo intact | unknown-error notice, Sentry |
| Picker cancelled or permission denied | cancel or deny | nothing changes; a denial explains how to enable access in Settings | N/A |
| Other user | another user's paths | read, insert and delete denied by the policies | RLS test |

</frozen-after-approval>

## Code Map

- `supabase/migrations/0013_wear_photos.sql` (new):
  - Add nullable `photo_path`, `photo_thumb_path` and `photo_thumbhash text` to `fit_wears`, with a check that both paths are null or both set, and each starts with `user_id::text || '/'`. Write the constraint in the skill's idempotent `DO` style.
  - Add an `fit_wears_update_own` policy with `using` and `with check`, both `user_id = (select auth.uid())`. Then `revoke update on public.fit_wears from authenticated, anon` and grant update on the three photo columns only.
  - Create the bucket `wear-photos` (private, `file_size_limit` 1 MB, `allowed_mime_types` `image/webp`) plus select, insert and delete policies on `storage.objects` in `0002_avatar_storage.sql`'s shape, using `(select auth.uid())::text`.
- `supabase/tests/rls.test.ts` -- extend the `fit_wears` and storage cross-user blocks:
  - another user can't update the photo columns;
  - even the owner can't update `worn_on`;
  - another user can't read, insert or delete `wear-photos` objects;
  - the owner can.
- `lib/fits/wearPhoto.ts` (new; the only module that talks to the bucket):
  - `processWearPhoto(uri)`: `expo-image-manipulator` resize to 1080px as WebP at 0.75, then 240px as WebP, plus `Image.generateThumbhashAsync` from `expo-image`.
  - `pickWearPhoto(source)`: `expo-image-picker`, `quality: 1`, no editing. The camera-or-library choice uses `ActionSheetIOS`, like Fit detail.
  - `saveWearPhoto(userId, wear, uri)`, `removeWearPhoto(wear)` and `deleteWearPhotoFiles(paths)`, following the save order above. Paths are `{uid}/{wearId}/{uuid}.webp` and `{uuid}_thumb.webp`, uploaded via `File` from `expo-file-system` like `lib/profile/avatar.ts`, never with `upsert`.
  - `useWearPhotoUrls(paths)`: signed URLs from `wear-photos`, shaped like `lib/wardrobe/thumbnailUrls.ts`.
- `lib/planner/plannedFits.ts` -- `getWearsBetween` also selects `id`, `photo_thumb_path`, `photo_path` and `photo_thumbhash`. Keep the `${fit_id}|${worn_on}` key set, and add a map from that key to the photo fields.
- `lib/fits/wornFitIds.ts` / `markFitWorn.ts` -- `unmarkFitWornToday` also removes that wear's photo files, and callers confirm first when the wear has a photo (`app/(tabs)/index.tsx`, `app/fit/[id].tsx`, native `ActionSheetIOS`). `invalidateWearQueries` is unchanged.
- `lib/fits/deleteFit.ts`:
  - Before the soft delete, read that Fit's wears with photos; `countFitWearPhotos(fitId)` gives the count for `app/fit/[id].tsx`'s delete confirmation.
  - After it, clear their photo columns, then delete the files with `deleteWearPhotoFiles`.
- UI:
  - `components/planner/PlanDaySheet.tsx` gets a new photo section (`components/planner/WearPhotoSection.tsx`).
  - `PlannerMonthGrid.tsx` and `PlannerDayRow.tsx` show the photo tile.
  - `components/home/TodayFitCard.tsx` gets the add action and the photo row.
  - Every photo uses `expo-image` with `placeholder={{ thumbhash }}`, `cachePolicy="disk"`, `cacheKey` set to the storage path, and `recyclingKey` set to the date in grids.
- Reuse: `Button`, `ConnectionErrorNotice`, `CheckIcon`, `usePlanDayWrites`'s busy pattern, `isOffline` and `Sentry`.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/0013_wear_photos.sql` and its `supabase/tests/rls.test.ts` cases.
- [x] `__tests__/wearPhoto.test.ts` -- tests first: processing sizes and format, the save order, rollback on a failed update, replace and remove file deletes, offline classification, and the thumbnail-only reads.
- [x] `__tests__/planner.test.tsx`, `__tests__/home.test.tsx`, `__tests__/plannedFits.test.ts` -- tests first for every matrix row in the UI.
- [x] `lib/fits/wearPhoto.ts`, `lib/planner/plannedFits.ts`, `lib/fits/markFitWorn.ts`.
- [x] `components/planner/WearPhotoSection.tsx`, `PlanDaySheet.tsx`, `PlannerMonthGrid.tsx`, `PlannerDayRow.tsx`, `components/home/TodayFitCard.tsx`, then the screens.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- log the deferred cost items and the `wardrobe` policies' unwrapped `auth.uid()`.

**Acceptance Criteria:**
- Given the Phase 5 boards, in light or dark mode, when the sheet, Home and month are shown, then they match them.
- Given 30 photo tiles in a month viewed twice, when the second view renders, then no image is downloaded again (disk cache keyed by path).
- Given the migration applied, when the RLS suite runs with credentials, then every cross-user and `worn_on` case is denied.

## Implementation Notes

- Built task by task with a review pause after each implementation task (user preference), not by one dispatched subagent.
- `cachePolicy="memory-disk"` instead of `"disk"`, per the vercel-react-native-skills `ui-expo-image` rule. The disk cache is still keyed by storage path; memory also skips re-decoding on month re-renders.
- Wear shapes: `getWearsBetween` returns `{ keys, byKey }` and `getTodayWornFitIds` returns a `Map` of Fit id to `{ id, photo }` (`.has` still works). Pure types and `wearKey` live in `lib/fits/wearRef.ts` so the reads don't load native image modules.
- Added beyond the Code Map: `lib/fits/useWearPhotoActions.ts` (shared add/replace/remove for Home and the Planner), `lib/fits/wearConfirmations.ts`, `components/fits/WearPhotoImage.tsx`, `components/ui/icons/CameraIcon.tsx`; tests in `markFitWorn`, `deleteFit`, `fitDetail` and `wornFitIds` for the undo and delete matrix rows.
- Copy not on the boards: undo confirm button "Undo wear"; camera denial alert "Camera access is off" with "Open Settings".
- Fit detail counts photos when Delete is pressed; a failed count shows the error instead of a confirmation.
- Mobbin check (native Take Photo / Library / Cancel sheet) matched the approved boards; no design change.
- Open: the RLS suite has not run (no service-role key locally, migration not applied), so the "Other user" matrix row and the RLS acceptance criterion are unverified until it does.

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | verification-gap | Home sheet's worn-Fit choice (no plan / different Fit worn) untested | medium | patch | Pre-verified gap; added two `home.test.tsx` cases. |
| 2 | verification-gap | Fit detail photo-count unknown-error path untested | medium | patch | Pre-verified gap; added test asserting notice, Sentry, no sheet, no delete. |
| 3 | verification-gap, blind | Bucket WebP-only / 1 MB limits and both-paths rule untested | medium | patch | Pre-verified; added RLS cases for PNG, oversized upload, one path only, other wear's folder, long thumbhash. |
| 4 | verification-gap, edge-case, blind | Double tap on Delete while the photo count loads stacks two confirmations | medium | patch | `handleDeletePress` awaited the count with no lock; added `countingRef` plus `disabled`, and a test. |
| 5 | verification-gap, edge-case, blind | Second tap during the undo-with-photo confirmation (Fit detail, Home) | false | reject | `ActionSheetIOS` presents synchronously as a native modal, so nothing behind it can be tapped. |
| 6 | edge-case | Undo in flight while today's sheet opens via Change lets Replace run on a wear being deleted | low | patch | Sheet `busy` ignored `wearBusy`; one-prop fix. |
| 7 | edge-case | Row update commits but the response is lost, so rollback deletes files the row points at | low | reject | Needs a lost response after a commit; fix adds a re-read and branching; orphan cleanup is already deferred. |
| 8 | edge-case, blind | Replace deletes files from a stale cached `wear.photo` | low | reject | Needs another device to change the photo while this screen's cache is stale (focus refetches); fix needs an RPC or conditional update. |
| 9 | edge-case, blind | `deleteFit` clear not scoped to the rows it read, so a photo saved meanwhile is orphaned | low | patch | Clear now filters `.in('photo_path', …)` on the read paths. |
| 10 | edge-case, blind | Photo whose URL can't be signed shows only the placeholder, with no fallback | low | reject | Same fail-open pattern as cover thumbnails; fix adds branches in three components. |
| 11 | edge-case | Signed URLs expire after 1h on a mounted screen | low | reject | Same pattern as `useThumbnailUrls`; cached files load by `cacheKey` regardless; rare. |
| 12 | edge-case, blind | Week rows don't show photos for unplanned worn days, though the comment says "same rule as the month" | low | patch | Week rows show only planned Fits (pre-existing), so behaviour matches the spec; corrected the misleading comment. |
| 13 | edge-case | Account deletion leaves wear-photo files | false | reject | No account-deletion code exists yet (Story 6.2); already logged in `deferred-work.md`. |
| 14 | blind | Home hint "Replace or remove it in the Planner" opens Home's own sheet | low | reject | Copy is mandated by the frozen intent; the fix would edit this spec. |
| 15 | blind | Home "Add a photo" busy state uses `onPress={undefined}`, not `disabled` | low | patch | Added `disabled` and `accessibilityState.disabled`. |
| 16 | blind | Re-encoded local files are never deleted | low | patch | Every save leaves two cache files; `saveWearPhoto` now deletes them in `finally`, with a test. |
| 17 | blind | Check constraint looser than its comments; thumbhash unbounded | low | patch | Paths must start with `{user_id}/{id}/`; `fit_wears_photo_thumbhash_check` caps it at 100 characters (migration not yet applied). |
| 18 | blind | New RLS block doesn't test anon | low | reject | `anon` has no `fit_wears` policies at all and the revoke covers it; low value. |
| 19 | blind | Delete shows a count read separately from `deleteFit`'s own read | low | reject | The count can differ only if a photo changes in the seconds between; the delete still cleans up what it reads. |

## Design Notes

- **Why column-level update:** the policy stops other users' rows; the column grant stops the owner rewriting a wear's date. The app's "only today" undo rule was client-side only, so this is the first database guarantee for 4.4's streak.
- **Why new file names:** a replaced photo is a different URL, so a cache never serves the stale image and never needs invalidating, which makes `cacheKey` set to the path safe forever.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean, no errors.
- `supabase db push` (local), then the RLS suite with credentials -- expected: the new cases pass.

**Manual checks:**
- On a device: add from the camera and from the library, replace, remove, and undo a wear that has a photo; deny the permission; go offline mid-save.
- Check the month's second view makes no photo downloads (Supabase logs), and that the uploaded file is 1080px WebP with no EXIF.
