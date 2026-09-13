-- Story 1.3: Set Up and Edit Profile
-- Private `wardrobe` Storage bucket for avatar uploads, with per-operation
-- RLS scoped to a user's own top-level path segment.
--
-- Bucket name is `wardrobe`, not `avatars`: it's the epic's own storage-path
-- convention (see epic-1-context.md), and later epics (wardrobe items, Fit
-- covers) reuse the same bucket. Avatars live at `{auth.uid()}/avatar.jpg` --
-- a fixed filename overwritten via upsert, never deleted -- so no DELETE
-- policy is needed.
--
-- Bucket is private (public: false): per the epic's "all data private
-- per-user" principle, avatar reads go through a signed URL generated for
-- the requesting user, not a public URL, and `createSignedUrl` itself
-- enforces the SELECT policy below.

-- 5 MB cap and a common-raster-image allowlist: nothing else at the storage
-- layer would otherwise stop an oversized or non-image upload from a caller
-- that bypasses the app's own crop/compress step. PNG/WebP are allowed
-- alongside JPEG since later epics reuse this same bucket for wardrobe item
-- cutouts, not just this story's JPEG avatars.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wardrobe',
  'wardrobe',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- `drop policy if exists` before each `create policy` makes this file safe
-- to re-run, matching the bucket insert's own `on conflict do nothing`.

-- SELECT: a user can only read objects under their own uid-prefixed folder.
drop policy if exists "wardrobe_select_own" on storage.objects;
create policy "wardrobe_select_own"
  on storage.objects
  for select
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- INSERT: a user can only create objects under their own uid-prefixed folder.
drop policy if exists "wardrobe_insert_own" on storage.objects;
create policy "wardrobe_insert_own"
  on storage.objects
  for insert
  with check (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- UPDATE: a user can only overwrite (upsert) objects under their own folder.
drop policy if exists "wardrobe_update_own" on storage.objects;
create policy "wardrobe_update_own"
  on storage.objects
  for update
  using (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'wardrobe'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Deliberately no DELETE policy: avatar changes overwrite the fixed
-- filename via upsert, never delete-then-insert.
