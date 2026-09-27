-- Story 5.4: Attach a Photo of the Outfit Actually Worn
-- One optional photo per `fit_wears` row, stored in a new private
-- `wear-photos` bucket. A photo belongs to a wear, never to a Fit or a bare
-- date, so its columns live on the wear row itself.
--
-- Every save uploads under a fresh `{user_id}/{wear_id}/{uuid}.webp` name
-- (plus a `{uuid}_thumb.webp` tile thumbnail) and never overwrites, so a
-- replaced photo is a new URL and the app's disk cache, keyed by storage
-- path, never serves a stale image. The old files are deleted once the row
-- points at the new ones (`lib/fits/wearPhoto.ts`).

alter table public.fit_wears add column if not exists photo_path text;
alter table public.fit_wears add column if not exists photo_thumb_path text;
alter table public.fit_wears add column if not exists photo_thumbhash text;

-- Both paths are set together or cleared together, and each must sit in this
-- wear's own `{user_id}/{id}/` folder, so a row can never point at another
-- user's file or another wear's. The thumbhash is a short base64 string
-- (~30 characters); the cap only stops a client storing something large.
-- Named explicitly and guarded by a `pg_constraint` lookup (not an inline
-- `check`) after 0006/0007's auto-named-constraint mix-up.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fit_wears_photo_paths_check'
      and conrelid = 'public.fit_wears'::regclass
  ) then
    alter table public.fit_wears
      add constraint fit_wears_photo_paths_check
      check (
        (photo_path is null and photo_thumb_path is null)
        or (
          photo_path is not null
          and photo_thumb_path is not null
          and starts_with(photo_path, user_id::text || '/' || id::text || '/')
          and starts_with(photo_thumb_path, user_id::text || '/' || id::text || '/')
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'fit_wears_photo_thumbhash_check'
      and conrelid = 'public.fit_wears'::regclass
  ) then
    alter table public.fit_wears
      add constraint fit_wears_photo_thumbhash_check
      check (photo_thumbhash is null or length(photo_thumbhash) <= 100);
  end if;
end $$;

comment on column public.fit_wears.photo_path is
  'Full-size (1080px WebP) wear photo in the `wear-photos` bucket, at '
  '{user_id}/{id}/{uuid}.webp. Only the Planner day sheet loads it.';
comment on column public.fit_wears.photo_thumb_path is
  '240px WebP thumbnail beside `photo_path`, at {user_id}/{id}/{uuid}_thumb.webp. '
  'Every tile loads this, never the full photo.';
comment on column public.fit_wears.photo_thumbhash is
  'Base64 thumbhash placeholder shown while the thumbnail loads.';

-- UPDATE is the first edit right on this table (0008/0009 shipped it
-- insert/select/delete only). RLS confines it to the caller's own rows...
drop policy if exists "fit_wears_update_own" on public.fit_wears;
create policy "fit_wears_update_own"
  on public.fit_wears
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ...and the column grant confines it to the photo columns. Without this the
-- owner could rewrite `worn_on` and fake Story 4.4's streak; this is the
-- first database-level guarantee behind it (the app's "only today" undo rule
-- is client-side). `markFitWornToday` is a plain insert, not an upsert, so it
-- never needs UPDATE on the other columns.
revoke update on public.fit_wears from authenticated, anon;
grant update (photo_path, photo_thumb_path, photo_thumbhash) on public.fit_wears to authenticated;

-- 1 MB cap and WebP only: the app re-encodes every photo to WebP at 1080px
-- before upload (which also strips EXIF), so anything else is a caller
-- bypassing that step.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wear-photos', 'wear-photos', false, 1048576, array['image/webp'])
on conflict (id) do nothing;

-- Same per-user-folder shape as 0002_avatar_storage.sql, with `auth.uid()`
-- wrapped in a subquery so it's evaluated once rather than per row, and
-- scoped `to authenticated` so anon requests skip them entirely. No UPDATE
-- policy: files are never overwritten, only added and deleted.
drop policy if exists "wear_photos_select_own" on storage.objects;
create policy "wear_photos_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'wear-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "wear_photos_insert_own" on storage.objects;
create policy "wear_photos_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'wear-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "wear_photos_delete_own" on storage.objects;
create policy "wear_photos_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'wear-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
