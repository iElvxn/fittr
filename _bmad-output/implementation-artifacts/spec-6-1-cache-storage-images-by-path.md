---
title: 'Story 6.1: Cache Storage Images by Path'
type: 'refactor'
created: '2026-09-28'
status: 'done'
baseline_commit: '6143e0dedf0ed7b1bf6231dcad988f7cd846c91e'
route: 'dispatch'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Every Storage image except wear photos is shown with `source={{ uri: signedUrl }}`, so expo-image caches it under the signed link, whose token changes. The same image downloads again whenever its link is re-signed: hourly, when any path joins or leaves a batched signing query (the key is every path), and when a screen's signing query is garbage-collected after 5 minutes away.

**Approach:** One shared `StorageImage` component shows a Storage file by its path. It passes `{ uri, cacheKey: path }` with `cachePolicy="memory-disk"` and `recyclingKey={path}`, the pattern `WearPhotoImage` already uses. Every file shown by path must never change in place, so the avatar moves to a new path per upload, and uploads to paths that never change declare a long `cacheControl`. The `wardrobe` bucket has no DELETE policy (`0002_avatar_storage.sql` says so on purpose), so every client-side file cleanup in that bucket silently deletes nothing today: `saveFit`'s previous-cover delete and rollback, `addItem`'s rollback, and the old-avatar cleanup this story adds. A folder-scoped `wardrobe_delete_own` policy, the same shape as `wear_photos_delete_own` (`0013_wear_photos.sql:111`), makes them work.

## Boundaries & Constraints

**Always:**
- The cache key is the Storage path, never the URL. It is only valid because the bytes at a path never change: covers (`cover-{ts}.png`), item `cutout.png`/`thumb.webp` (fixed per item id) and wear photos (UUID names) already satisfy this. The avatar must too.
- Avatar uploads write `{userId}/avatar-{timestamp}.jpg` and best-effort delete the previous file after the profile row points at the new one (same order as `saveFit`'s previous-cover cleanup). Old `{userId}/avatar.jpg` rows keep working until the next change.
- The `wardrobe` bucket gets a `wardrobe_delete_own` Storage policy: `for delete to authenticated`, `bucket_id = 'wardrobe'` and first folder = `(select auth.uid())::text`. A user can delete only files in their own folder.
- Uploads to write-once paths set `cacheControl: '31536000'`. The files are private, and only the owner's device ever holds them.
- The fallback, placeholder, transition and accessibility behavior of each call site stays as it is. No visual change.
- `ClosetTile` and every other recycled list cell use `recyclingKey={path}`, not the URL.

**Never:** no change to the signing queries' shape or expiry, no public buckets, no table or column change (the Storage delete policy is the only migration), no on-disk cache of signed URLs, and no new dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Re-signed link | same path, new token (hourly, batch change, or GC) | image served from the device cache, no download | N/A |
| New file | a path not yet cached | downloads once, then cached under its path | the call site's existing fallback when the URL is null |
| Avatar change | user picks a new avatar | new `avatar-{ts}.jpg` path; Home and Profile show the new image at once | upload failure: existing avatar error flow; the old file is kept |
| Old avatar row | profile still on `{userId}/avatar.jpg` | shows as today; the next change moves it to a versioned path | N/A |
| Recycled cell | a FlashList cell reused for another item | blank or placeholder, never the previous item's image | N/A |
| Local image | `file://` URI (capture, collage preview, picked avatar) | unchanged: shown by URI, not through `StorageImage` | N/A |
| Profile avatar preview | `app/profile.tsx`: a just-picked local avatar, or the stored one | picked: plain `Image` by URI; stored: `StorageImage` by `avatar_path` | N/A |
| Delete own file | owner removes a file in their `wardrobe` folder (old avatar, old cover, rollback) | the file is deleted | failure: best-effort, reported to Sentry, the file stays |
| Delete another user's file | user 2 removes a path in user 1's folder | nothing is deleted | N/A |

</frozen-after-approval>

## Code Map

- `components/fits/WearPhotoImage.tsx` -- the golden example: `{ uri: url, cacheKey: path }`, `cachePolicy="memory-disk"`, `recyclingKey`, and a `localUri` that bypasses the cache. Generalize into `components/ui/StorageImage.tsx` (`path`, `url`, plus pass-through `Image` props such as `contentFit`, `style`, `testID`, `accessibilityLabel`, `onLoad`, `placeholder`, `transition`). It passes no source while `url` is null and defaults `recyclingKey` to `path`. `WearPhotoImage` becomes a thin wrapper that keeps its `contentFit="cover"`, thumbhash placeholder, `transition` and `recyclingKey` override.
- Call sites that already hold the path next to the URL (swap `Image` for `StorageImage`): `components/fits/FitItemsList.tsx:54` (`item.thumbPath`); `components/home/WeekStrip.tsx:72`, `components/planner/PlanDaySheet.tsx:217`, `components/wardrobe/ItemFitsStrip.tsx:68` (`fit.cover_path`); `components/wardrobe/ClosetTile.tsx:129` (`thumbPath` prop); `app/fit/[id].tsx:480` (cover); `app/item/[id].tsx:316` (cutout); `app/(tabs)/index.tsx:276` (`profile.avatar_path`).
- Call sites that receive only a URL prop (add a sibling path prop, filled by the parent from the key it signed): `FitsGridCell` (`thumbnailUrl`; parent `app/(tabs)/fits.tsx`), `TodayFitCard` (`coverUrl`), `DayFitHeader` (`coverUrl`; parent `PlanDaySheet.tsx:157,172`), `PlannerDayRow` and `PlannerMonthGrid` (`coverUrl`; they already take `photo.thumbPath` for the wear photo), `WearPhotoSection` (`coverUrl`), `WardrobeGridCell` (`thumbnailUrl`; parent `components/fitBuilder/CatalogSheet.tsx`), `CanvasItem` (`imageUrl`; parent `components/fitBuilder/FitCanvas.tsx:161`, which already has `cutoutPath`).
- `components/wardrobe/ClosetTile.tsx:94-110` -- `handleLoad` ignores any `onLoad` whose `event.source.url` isn't the current `thumbnailUrl`, to skip a recycled tile's late load. With a path cache key, a cache hit may report the URL the file was first stored under (unverified in expo-image), which would reject every cached load and leave tiles at the category default aspect. Guard by path instead (e.g. the path the load was requested for), not by URL.
- `app/profile.tsx:110,133` -- `displayedAvatarUri = pickedAvatarUri ?? avatarUrl`. Picked: plain `Image` by URI. Stored: `StorageImage` with `profile.avatar_path`. Keep `testID="avatar-preview"` on whichever renders.
- Leave alone (local URIs or bundled assets): `components/fitBuilder/SaveFitSheet.tsx:77`, `components/wardrobe/BatchQueueRow.tsx:110`, `components/wardrobe/CameraFilmstrip.tsx:43`, `app/onboarding.tsx:96`, `components/fitBuilder/GarmentSilhouette.tsx:38`.
- `lib/profile/avatar.ts:25-45` -- `uploadAvatar` writes `{userId}/avatar.jpg` with `upsert: true`. Change to `{userId}/avatar-${Date.now()}.jpg`, no upsert, with `cacheControl`; return the path. Update its doc comment.
- `lib/profile/updateProfile.ts` -- add optional `previousAvatarPath`. After the row update succeeds and `avatarPath` differs from it, best-effort `remove([previousAvatarPath])`, reported to Sentry on failure, never thrown. If the server rejects the row update after a new `avatarPath` was uploaded, best-effort remove the new file before rethrowing, so a failed save leaves no orphan. Not on a no-connection error: the update may have committed before the response was lost, and removing the file would leave the row pointing at nothing -- an orphan is the cheaper failure.
- Callers: `app/profile.tsx:82-88` passes `profile?.avatar_path`. `app/onboarding.tsx:58-59` passes nothing (a new account has no avatar). Update both files' "fixed-filename upsert" comments (`profile.tsx:32-35`, `onboarding.tsx:22-24`). Cancel stays a true no-op, since nothing uploads until Save.
- `cacheControl: '31536000'` on: `lib/fits/saveFit.ts:33` (`uploadCover`); `lib/wardrobe/addItem.ts:76` (`uploadOne`: its paths are fixed per item id, but a retry only re-uploads the same processed bytes); `lib/fits/wearPhoto.ts:136` (`upload`, `wear-photos` bucket); `lib/profile/avatar.ts`.
- `supabase/migrations/0014_wardrobe_storage_delete.sql` (new) -- `drop policy if exists` then `create policy "wardrobe_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'wardrobe' and (storage.foldername(name))[1] = (select auth.uid())::text)`, copied from `0013_wear_photos.sql:111-119`. Its header comment explains why `0002`'s "deliberately no DELETE policy" no longer holds. Don't edit `0002`; applied migrations stay as they are.
- `supabase/tests/rls.test.ts:114-184` (`wardrobe storage RLS`) -- add: a second user's `remove` leaves the file (checked with `admin.storage.list`), the owner's `remove` deletes it. Follow `:934-961`.
- Cleanups that start working with the policy, no code change: `saveFit.ts` `rollbackCover` and `insertFit`'s previous-cover delete; `addItem.ts:65` and `saveBatch` rollbacks. Their unit tests mock Storage, so they don't change.
- Tests asserting `source.uri` that gain `cacheKey`: `__tests__/fitDetail.test.tsx`, `fitItemsList.test.tsx`, `home.test.tsx`, `itemDetail.test.tsx`, `planner.test.tsx`, `profileEdit.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/storageImage.test.tsx` (new) -- `cacheKey: path`, `memory-disk`, `recyclingKey` defaulting to `path`, a re-signed URL for the same path keeps the same cache key, a null URL passes no source.
- [x] `components/ui/StorageImage.tsx`, `components/fits/WearPhotoImage.tsx` -- the shared component; the wrapper keeps wear-photo behavior.
- [x] Every call site in the Code Map (parents pass the path; `ClosetTile`'s load guard compares by path) -- switch to `StorageImage`, and update the listed tests to expect `cacheKey`.
- [x] `app/profile.tsx` -- split the picked and stored avatar preview.
- [x] `lib/profile/avatar.ts`, `lib/profile/updateProfile.ts`, `app/profile.tsx`, `app/onboarding.tsx` (+ `avatar.test.ts`, `updateProfile.test.ts`, `profileEdit.test.tsx`) -- versioned avatar path; delete the previous file after the row update; remove the new file if the row update fails.
- [x] `lib/fits/saveFit.ts`, `lib/wardrobe/addItem.ts`, `lib/fits/wearPhoto.ts` (+ their upload-option assertions) -- `cacheControl: '31536000'`.
- [x] `supabase/migrations/0014_wardrobe_storage_delete.sql`, `supabase/tests/rls.test.ts` -- the policy and its cross-user test. The developer applies `0014` to the dev/CI Supabase project (SQL Editor, as with `0013`) before running the RLS suite.

**Acceptance Criteria:**
- Given `grep -rn "source={{ uri" components app`, when run, then only the local-URI sites in the Code Map remain, plus `app/profile.tsx`'s picked-avatar branch.
- Given the RLS suite with live credentials and `0014` applied, when run, then the owner can delete a file in their `wardrobe` folder and a second user cannot.
- Given the Wardrobe grid on a device, when it is opened, an item is added, and it is opened again, then existing thumbnails don't download again and tiles keep their measured shapes.

## Design Notes

- Supabase's Smart CDN caches each signed link separately, so new tokens always miss it. The device cache keyed by path is the only layer that can skip the download; `cacheControl` is a small secondary gain.
- Paths can't collide across buckets: wear photos live under `{userId}/{wearId}/`, wardrobe files under `{userId}/items/`, `{userId}/fits/` and `{userId}/avatar-*`.
- The signed-link requests themselves still run. They are small JSON calls, and reducing them is out of scope.
- Epic 1 retro item 3 (a database check on `avatar_path`'s shape, still open) must accept `{userId}/avatar-{ts}.jpg` as well as `{userId}/avatar.jpg`.

## Implementation Notes

- Path props (deviation from the Code Map's wording, same intent): `TodayFitCard`, `DayFitHeader`, `PlannerDayRow`, `WearPhotoSection` and `PlannerMonthGrid`'s `MonthCell` already receive the `fit` whose `cover_path` their parent signed, so they read `fit.cover_path` rather than take a sibling `coverPath` prop -- one source of truth, and their parents are unchanged. Only URL-only components get a new required prop: `FitsGridCell.thumbnailPath` (`string | null`), `WardrobeGridCell.thumbnailPath`, `CanvasItem.imagePath` (`string | null`).
- `WearPhotoImage`'s `localUri` branch stays a plain `Image` (matrix: local images never go through `StorageImage`); `storageImageUsage.test.ts` allows it only for `localUri`. Stored wear photos without a `recyclingKey` now recycle by path.
- `storageImageUsage.test.ts` encodes the first acceptance criterion (the `source={{ uri` grep) as a test.

## Spec Change Log

- Review 1, triage #1 (blind-hunter + verification-gap): the Code Map's "remove the new file if the row update fails" also removed it on a no-connection error, after which the row may already point at it (a committed update whose response was lost) -- a broken avatar. Amended the `updateProfile.ts` line to roll back only on a server rejection. Known-bad state avoided: profile row pointing at a deleted avatar file. KEEP: every other change in this story as implemented and reviewed task by task (StorageImage, all call sites, ClosetTile guard, Profile preview split, versioned avatar, cleanup order, cacheControl, 0014 and its RLS test); the user chose a targeted fix over a full revert.

## Review Triage Log

Review 1 (blind-hunter, edge-case-hunter, verification-gap). Verdict / route -- finding -- evidence.

| # | Verdict | Route | Finding | Evidence |
|---|---|---|---|---|
| 1 | medium | bad_spec | `updateProfile` deletes the new avatar on a no-connection update error, though the row may have committed (lost response) | `AuthRetryableFetchError` is raised by a failed fetch, which can follow a server-side commit; the row would then point at a deleted file. Code follows the Code Map's "remove the new file if the row update fails". |
| 2 | low | patch | Home/Planner covers and the Home avatar have no rendered `cacheKey` assertion | `home.test.tsx`/`planner.test.tsx` assert `cacheKey` only for wear photos; Home's avatar is always mocked absent (`home.test.tsx:165-166`). A wrong `path` would pass the source-text guard. |
| 3 | low | defer | `CanvasItem`'s `StorageImage` branch is never rendered by a test | `CanvasItem` is mocked in every suite (Reanimated v4 has no working jest mock, `fitCanvas.test.tsx:9-18`); it has had no rendered test since before this story. |
| 4 | maybe-false | defer | `0014` may not be applied to the project CI's RLS suite uses | Applied and passing (31/31) on the project in `.env.local`; whether CI's secrets point at the same project is unknown -- settle by checking the CI secrets' project ref. |
| 5 | low | reject | Update matching zero rows would delete the previous avatar the row still uses | Unreachable in practice: the row is created by `handle_new_user` and `profiles_update_own` covers it; fix adds a `.select` + branch. |
| 6 | false | reject | Saving before the profile loads leaves `previousAvatarPath` undefined | `app/profile.tsx:121-189`: Edit only renders after `isLoading`/`isError` clear, so `profile` is loaded. A stale cache can only orphan a file (low). |
| 7 | low | reject | Upload committed but response lost leaves an orphan `avatar-{ts}.jpg` | Orphan costs storage only; same pre-existing pattern as `uploadCover`; fix adds a branch. |
| 8 | false | reject | Older builds overwriting legacy `avatar.jpg` serve a stale path-cached avatar | The app is unreleased (no tags or store builds); every build runs this JS, so nothing writes `avatar.jpg` any more. |
| 9 | maybe-false | defer | A cache hit may report a non-signed `source.url` (bare key or `file://`), so `isSignedUrlFor` drops the measurement | User's device check passed (tiles kept shapes); the other platform is unverified. If true: medium (tiles stay at default aspect). Settle by logging `event.source.url` on a cached load on iOS and Android. |
| 10 | low | patch | `storageImageUsage` regex misses the `source={{ uri }}` shorthand | Real: `uri\s*:` requires a colon. Direct regex fix. Variables/template literals are left to the rendered tests. |
| 11 | false | reject | Guard scans only `app/` and `components/` | No `.tsx` exists under `lib/` or `stores/`; all JSX lives in the scanned roots. |
| 12 | low | reject | Whole-file allowlist exemptions | The four files show only local captures/collages; pinning each adds test machinery for an unlikely regression. |
| 13 | low | patch | `addItem.ts` comment says `upsert` is "same as `uploadAvatar`" | `uploadAvatar` no longer upserts (`lib/wardrobe/addItem.ts:40`). |
| 14 | medium | defer | Editing a Fit whose `fit_items` write fails soft-deletes the existing Fit (`rollbackOrphanedFit`), and 0014 now makes `rollbackCover` delete its new cover | Pre-existing: `app/new-fit.tsx:270` reuses `insertFit` for edits with the same id. A retry restores it (`deleted_at: null`), but an abandoned save makes the Fit vanish. Not caused by this story. |
| 15 | low | patch | `docs/phase-1-spec.md:145` and `spec-phase-1/data-model.md:88` still give `avatar.jpg` | Doc drift caused by the versioned path. |
| 16 | low | defer | Epic 1 retro action (sprint-status) targets `avatar.jpg` only for account deletion | Users can now hold several `avatar-*.jpg` (failed best-effort deletes); that story should remove the whole `{uid}/` folder. |
| 17 | low | patch | `lib/storageCache.ts` comment overstates the header's effect | The device cache (SDWebImage/Glide) ignores `max-age`; the header only reaches HTTP layers. Claim of no measurement is false: the device check logged `cacheType`. |
| 18 | medium | defer | Private images stay in the device cache after sign-out | Pre-existing: expo-image's default `cachePolicy` is already `disk`, and nothing clears it on sign-out today. |
| 19 | low | reject | `isSignedUrlFor` should live in `lib/` | One caller; no named harm. |
| 20 | low | reject | Same-millisecond avatar uploads collide (409) | A retry gets a new timestamp; two devices in one ms is not everyday use. |
| 21 | false | reject | Onboarding test doesn't assert that no `previousAvatarPath` is passed | `onboarding.test.tsx`'s `toHaveBeenCalledWith('user-1', { displayName, avatarPath })` already fails on any defined extra key. Its mock was updated to the versioned path shape. |
| 22 | low | patch | RLS test doesn't check an anonymous client can't delete | Cheap security check; `0014` is `to authenticated`. |

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device, with the network inspector: open Wardrobe, My Fits and Home, leave for more than 5 minutes, come back. No image bytes download again. Change the avatar: the new one shows at once on Profile and Home, and the old file is gone from the bucket (Supabase dashboard). Re-save an edited Fit: the previous cover file is gone.
