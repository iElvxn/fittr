-- Story 3.3 follow-up, fixing 0006: `0004_fits.sql`'s original inline
-- `cover_path text check (...)` auto-named itself `fits_check`, not
-- `fits_cover_path_check` as assumed -- confirmed by querying
-- `pg_constraint` directly rather than guessing again. 0006's `drop
-- constraint if exists fits_cover_path_check` was therefore a no-op (that
-- name never existed), and its `add constraint fits_cover_path_check`
-- just added a second, looser constraint alongside the still-active
-- original -- CHECK constraints are ANDed together, so the original's
-- fixed-path-only shape kept rejecting every versioned cover_path,
-- blocking every save (create and edit) rather than just old rows'.
--
-- `fits_cover_path_check` (0006) already validates correctly on its own
-- (either the old fixed shape or the new versioned one), so the fix is
-- just dropping the stale original.

alter table public.fits drop constraint if exists fits_check;
