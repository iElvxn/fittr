-- Index `fit_items.item_id`, the one foreign key in the schema without one.
--
-- 0004_fits.sql indexed `fit_id` (every read of a Fit's placements) but not
-- `item_id`. Two paths need it:
-- 1. Item detail's "In N Fits" strip (`lib/wardrobe/itemFits.ts`) filters
--    `fit_items` by `item_id`. Without this index that is a sequential scan
--    of every user's placements on each Item detail open.
-- 2. `item_id ... on delete cascade`: hard-deleting a wardrobe item (e.g.
--    account deletion via `auth.users`) scans `fit_items` once per deleted
--    item. Pieces are only soft-deleted today, but the cascade still exists.
--
-- Plain `create index`, not `concurrently`: migrations run inside a
-- transaction, and `fit_items` is small enough that the brief write lock
-- is harmless.

create index if not exists fit_items_item_id_idx
  on public.fit_items (item_id);
