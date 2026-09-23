-- Story 4.2: Favorite a Fit and Mark It Worn
-- `fits_set_updated_at` (0004_fits.sql) fires unconditionally on any UPDATE,
-- and My Fits sorts by `updated_at desc` (`lib/fits/listFits.ts`). Before
-- this story, nothing updated a `fits` row that stayed visible in the grid
-- post-update (an edit legitimately resurfaces it; a soft-delete removes it
-- from view). Favoriting is the first case where a still-visible row gets
-- updated for a reason a user would not expect to reorder the grid for --
-- without this, tapping Favorite silently jumps the Fit to the top.
--
-- `public.set_updated_at()` is shared by `profiles`/`wardrobe_items`/`fits`
-- (0001/0003/0004), so it can't be taught about a `fits`-only column --
-- this scopes the fix to `fits`'s own trigger via a `WHEN` clause instead,
-- listing every column that *should* still bump `updated_at`. A future
-- column added to `fits` that should resurface the Fit needs adding here.

drop trigger if exists fits_set_updated_at on public.fits;

create trigger fits_set_updated_at
  before update on public.fits
  for each row
  when (
    old.name is distinct from new.name
    or old.cover_path is distinct from new.cover_path
    or old.canvas_background_color is distinct from new.canvas_background_color
    or old.deleted_at is distinct from new.deleted_at
  )
  execute function public.set_updated_at();
