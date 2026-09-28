---
title: 'Story 6.1: Cache Storage Images by Path'
type: 'refactor'
created: '2026-09-27'
status: 'draft'
route: ''
review_loop_iteration: 0
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

- `components/fits/WearPhotoImage.tsx` -- the golden example (`cacheKey: path`, `memory-disk`, `recyclingKey`). Generalize it into `components/ui/StorageImage.tsx` (props: `path`, `url`, plus pass-through Image props), and make `WearPhotoImage` a thin wrapper or replace it.
- Call sites that show a signed Storage URL by `uri` (from a grep of `source={{ uri`): `components/fits/FitItemsList.tsx:54`, `components/fits/FitsGridCell.tsx:139`, `components/home/TodayFitCard.tsx:96`, `components/home/WeekStrip.tsx:72`, `components/planner/DayFitHeader.tsx:62`, `components/planner/PlanDaySheet.tsx:217`, `components/planner/PlannerDayRow.tsx:113`, `components/planner/PlannerMonthGrid.tsx:143`, `components/planner/WearPhotoSection.tsx:121`, `components/wardrobe/ClosetTile.tsx:129` (and its `recyclingKey={thumbnailUrl}` at :132), `components/wardrobe/ItemFitsStrip.tsx:68`, `components/wardrobe/WardrobeGridCell.tsx:29`, `components/fitBuilder/CanvasItem.tsx:219`, `app/(tabs)/index.tsx:276` (avatar), `app/fit/[id].tsx:480`, `app/item/[id].tsx:316`. Each already has the path next to the URL (the signed-URL map is keyed by path).
- Conditional site: `app/profile.tsx:110,133` -- `displayedAvatarUri = pickedAvatarUri ?? avatarUrl` mixes a local file with the signed avatar. Render the picked URI with a plain `Image` and the stored avatar with `StorageImage` (path `profile.avatar_path`).
- Leave alone (local URIs): `components/fitBuilder/SaveFitSheet.tsx:77`, `components/wardrobe/BatchQueueRow.tsx:110`, `components/wardrobe/CameraFilmstrip.tsx:43`, `app/onboarding.tsx:96`.
- `lib/profile/avatar.ts:30-45` -- fixed path + `upsert: true`. Change to a versioned path, no upsert, and return it. The caller (`lib/profile/updateProfile.ts`) removes the previous path after the row update succeeds. `app/profile.tsx` and `app/onboarding.tsx` call it.
- Uploads that get `cacheControl`: `lib/fits/saveFit.ts:33`, `lib/wardrobe/addItem.ts:76`, `lib/fits/wearPhoto.ts:136`, `lib/profile/avatar.ts:35`.
- `supabase/migrations/0002_avatar_storage.sql` -- the read/insert/update policies are by folder, so a versioned file name needs no change to them. It has no DELETE policy (`:8,68`).
- `supabase/migrations/0014_wardrobe_storage_delete.sql` (new) -- `wardrobe_delete_own`, modeled on `0013_wear_photos.sql:111-119`. Update the comments in `0002` that say deletes are not allowed.
- `supabase/tests/rls.test.ts:114` (`wardrobe storage RLS`) -- add owner-can-delete and other-user-cannot-delete cases, following the wear-photos case at `:934-961`.
- Existing cleanups that start working once the policy exists: `lib/fits/saveFit.ts` (previous-cover delete and `rollbackCover`), `lib/wardrobe/addItem.ts` rollback. No code change needed; check that their tests don't assume the delete is a no-op.
- Epic 1 retro item 3 (database check on `avatar_path` shape, still open) must accept `{userId}/avatar-{ts}.jpg` as well as the old `{userId}/avatar.jpg`.

## Tasks & Acceptance

**Execution:**
- [ ] `__tests__/storageImage.test.tsx` and the affected screen/component tests -- the component passes `cacheKey: path`, `memory-disk` and `recyclingKey={path}`, and a changed URL for the same path keeps the same cache key. Update existing `imageProp(...).uri` assertions to also expect `cacheKey`.
- [ ] `components/ui/StorageImage.tsx`, `components/fits/WearPhotoImage.tsx` -- the shared component.
- [ ] every call site in the Code Map -- switch to `StorageImage`.
- [ ] `lib/profile/avatar.ts`, `lib/profile/updateProfile.ts` (+ tests) -- versioned avatar path and cleanup of the previous file.
- [ ] the four upload sites -- `cacheControl: '31536000'`.
- [ ] `supabase/migrations/0014_wardrobe_storage_delete.sql`, `supabase/tests/rls.test.ts` -- the delete policy and its cross-user test. Apply the migration to the CI Supabase project before the RLS suite runs.

**Acceptance Criteria:**
- Given `grep -rn "source={{ uri" components app`, when run, then only the local-URI call sites listed above remain.
- Given the RLS suite with live credentials, when run, then the owner can delete a file in their `wardrobe` folder and a second user cannot.
- Given the app on a device, when the Wardrobe grid is opened, an item is added, and the grid is opened again, then the existing thumbnails don't download again (check in the network inspector or with an offline toggle after the first load).

## Design Notes

- Supabase's Smart CDN caches each signed link separately, so new tokens always miss it. The device cache keyed by path is the only layer that can skip the download. `cacheControl` only sets the HTTP client lifetime, and expo-image's disk cache goes by `cacheKey`, so it's a small secondary gain.
- The signed-link requests themselves still run. They are small JSON calls, and reducing them is out of scope.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device, with the network inspector: open Wardrobe, My Fits and Home, leave for more than 5 minutes, come back. No image bytes download again. Change the avatar: the new one shows at once on Profile and Home, and the old file is gone from the bucket (Supabase dashboard). Re-save an edited Fit: the previous cover file is gone.
