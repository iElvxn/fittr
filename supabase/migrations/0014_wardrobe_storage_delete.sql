-- Story 6.1: Cache Storage Images by Path
-- Lets a user delete files in their own folder of the `wardrobe` bucket.
--
-- 0002 deliberately left out a DELETE policy because the avatar was a fixed
-- `{uid}/avatar.jpg` overwritten via upsert. That no longer holds: images
-- are now cached on the device by storage path, which is only valid while a
-- path's bytes never change, so every avatar change uploads a new
-- `{uid}/avatar-{ts}.jpg` and deletes the previous file
-- (`lib/profile/updateProfile.ts`). Without this policy that delete -- and
-- the cleanups already in the app (`saveFit`'s previous-cover delete and
-- rollback, `addItem`'s upload rollbacks) -- silently deletes nothing:
-- Storage reports RLS-hidden objects as an empty result, not an error.
--
-- Same shape as 0013's `wear_photos_delete_own`: authenticated users only,
-- first path segment must be the caller's own uid, and `(select auth.uid())`
-- so it's evaluated once per statement rather than per row. 0002 itself is
-- left as applied.

drop policy if exists "wardrobe_delete_own" on storage.objects;
create policy "wardrobe_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
