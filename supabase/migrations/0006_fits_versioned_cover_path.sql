-- Story 3.3 follow-up: a Fit's cover was always uploaded to the same fixed
-- path (upsert: true), so re-saving after an edit produced a byte-identical
-- URL for genuinely new content -- both `expo-image`'s cache and Supabase
-- Storage's own CDN keyed off that URL string, and a query-string
-- cache-buster (tried first) didn't reliably hold up against the CDN.
-- Switching to one path per save -- the previous version best-effort
-- deleted by lib/fits/saveFit.ts once the new one is confirmed committed --
-- makes the URL itself change on every save, which every cache layer
-- respects unconditionally, no cache-layer cooperation required.
--
-- `0004_fits.sql`'s original constraint (`cover_path = ... || '/cover.png'`)
-- can't be edited in place -- it's already applied -- so this drops and
-- replaces it with a shape allowing either the original fixed path or a
-- numeric version suffix. Both, not just the new one: existing rows still
-- have the old fixed-path value (their actual Storage object hasn't moved
-- and still resolves fine), and a `CHECK` added to a table with existing
-- rows is validated against all of them immediately -- requiring only the
-- new shape here would reject every Fit saved before this migration. Old
-- rows organically pick up the new shape the next time they're edited
-- (`lib/fits/saveFit.ts`'s `uploadCover` always writes a fresh versioned
-- path), so no backfill of the old rows or their Storage objects is needed.

alter table public.fits drop constraint if exists fits_cover_path_check;

alter table public.fits
  add constraint fits_cover_path_check
  check (
    cover_path is null
    or cover_path = user_id::text || '/fits/' || id::text || '/cover.png'
    or cover_path ~ ('^' || user_id::text || '/fits/' || id::text || '/cover-[0-9]+\.png$')
  );

comment on column public.fits.cover_path is
  'Path in the `wardrobe` Storage bucket. New saves write '
  '{user_id}/fits/{id}/cover-{version}.png (`version` a millisecond '
  'timestamp) -- one path per save, not overwritten in place, so the URL '
  'itself changes when the content does; see 0006''s header comment. Rows '
  'from before that change may still carry the older fixed '
  '{user_id}/fits/{id}/cover.png shape until their next edit. The previous '
  'version is best-effort deleted once a save fully commits.';
