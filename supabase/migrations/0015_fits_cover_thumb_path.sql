-- Story 6.2: every small surface (My Fits grid, Home's week strip, the
-- Planner, Item detail's Fits strip) used to download a Fit's full-resolution
-- PNG cover. Each save now also uploads a small WebP thumbnail of that cover
-- (800px long edge, made on-device), stored here. Nullable: Fits saved before
-- this migration have no thumbnail and small surfaces fall back to
-- `cover_path` until their next edit -- no backfill.
--
-- The check mirrors `fits_cover_path_check`'s shape (0006), pinned to the
-- row's own user/Fit folder. Named explicitly (0007's lesson: inline checks
-- auto-name). RLS is unchanged -- the column sits on an already-scoped row.

alter table public.fits add column cover_thumb_path text;

alter table public.fits
  add constraint fits_cover_thumb_path_check
  check (
    cover_thumb_path is null
    or cover_thumb_path ~ ('^' || user_id::text || '/fits/' || id::text || '/cover-[0-9]+_thumb\.webp$')
  );

comment on column public.fits.cover_thumb_path is
  'Path in the `wardrobe` Storage bucket of the cover''s small WebP '
  'thumbnail: {user_id}/fits/{id}/cover-{version}_thumb.webp, sharing its '
  '`version` with cover_path. Write-once, like the cover; the previous pair '
  'is best-effort deleted once a save fully commits. Null for Fits saved '
  'before Story 6.2 until their next edit -- small surfaces then fall back '
  'to cover_path.';
