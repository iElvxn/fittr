-- Story 3.2: Preview, Name, and Save a Fit
-- `fits` + `fit_items` tables + explicit per-operation row-level security.
--
-- `fits.id` is a client-generated uuid, same convention as `wardrobe_items.id`
-- -- the client derives the Storage cover path (`{uid}/fits/{fitId}/cover.png`)
-- before the row exists, so it can upload ahead of the insert.
--
-- `fits` mirrors `wardrobe_items`' shape and RLS discipline exactly: soft
-- delete via `deleted_at`, no client-side DELETE policy, `(select auth.uid())`
-- wrapped per Supabase's RLS-performance guidance, `updated_at` trigger reused
-- from `0001_profiles.sql`.
--
-- `fit_items` deliberately diverges from `_bmad-output/specs/spec-phase-1/data-model.md`
-- in two ways, both logged here since that doc is the source of truth elsewhere:
--
-- 1. Primary key is its own client-generated uuid (`id`), not the documented
--    composite `(fit_id, item_id)`. Story 3.1's canvas lets a user place the
--    same wardrobe item on the canvas more than once (`CatalogSheet` doesn't
--    filter already-placed items), and a composite key can't represent two
--    placements of the same item. A plain index on `fit_id` replaces the
--    composite key's implicit lookup support.
-- 2. No `user_id`/`created_at`/`updated_at`/`deleted_at` columns -- matches
--    `data-model.md`'s own per-table column list for `fit_items` (unlike its
--    generic "every table carries these" preamble), since a Fit's item
--    placements are wholesale replaced on save/edit, not individually
--    soft-deleted. RLS therefore checks ownership through a subquery against
--    `fits.user_id` rather than a column on this table, and -- because there
--    is no `deleted_at` to fall back on -- this table gets a real DELETE
--    policy, unlike every soft-delete-only table elsewhere in this schema.
--    That DELETE policy is exercised by this very story: `saveFit.ts` rolls
--    back already-inserted `fit_items` rows if a later step in the same save
--    attempt fails.

create table if not exists public.fits (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  is_favorite boolean not null default false,
  cover_path text check (cover_path is null or cover_path = user_id::text || '/fits/' || id::text || '/cover.png'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.fits is
  'One row per saved outfit. cover_path points at the `wardrobe` Storage '
  'bucket under {user_id}/fits/{id}/cover.png. deleted_at is a soft delete. '
  'is_favorite is unused until Epic 4''s favorite toggle -- included now '
  'per data-model.md''s canonical fits schema, defaulting false so Story '
  '3.2''s own insert never needs to set it.';

alter table public.fits enable row level security;

create policy "fits_select_own"
  on public.fits
  for select
  using (user_id = (select auth.uid()));

create policy "fits_insert_own"
  on public.fits
  for insert
  with check (user_id = (select auth.uid()));

create policy "fits_update_own"
  on public.fits
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Deliberately no DELETE policy: removal is the soft-delete UPDATE above
-- (Story 3.3), matching `wardrobe_items`'/`profiles`' precedent.

create trigger fits_set_updated_at
  before update on public.fits
  for each row
  execute function public.set_updated_at();

create index if not exists fits_user_id_idx
  on public.fits (user_id);

create index if not exists fits_user_id_not_deleted_idx
  on public.fits (user_id)
  where deleted_at is null;

create table if not exists public.fit_items (
  id uuid primary key,
  fit_id uuid not null references public.fits (id) on delete cascade,
  item_id uuid not null references public.wardrobe_items (id) on delete cascade,
  x real not null,
  y real not null,
  scale real not null,
  rotation real not null,
  z_index integer not null
);

comment on table public.fit_items is
  'One row per item placed on a Fit''s canvas. No user_id/deleted_at of its '
  'own -- ownership is checked through fits.user_id, and rows are wholesale '
  'replaced (hard-deleted/reinserted) on save/edit rather than soft-deleted.';

alter table public.fit_items enable row level security;

create policy "fit_items_select_own"
  on public.fit_items
  for select
  using (exists (
    select 1 from public.fits
    where fits.id = fit_items.fit_id and fits.user_id = (select auth.uid())
  ));

create policy "fit_items_insert_own"
  on public.fit_items
  for insert
  with check (exists (
    select 1 from public.fits
    where fits.id = fit_items.fit_id and fits.user_id = (select auth.uid())
  ));

create policy "fit_items_update_own"
  on public.fit_items
  for update
  using (exists (
    select 1 from public.fits
    where fits.id = fit_items.fit_id and fits.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.fits
    where fits.id = fit_items.fit_id and fits.user_id = (select auth.uid())
  ));

-- Real DELETE policy (not soft delete -- see the table comment above).
create policy "fit_items_delete_own"
  on public.fit_items
  for delete
  using (exists (
    select 1 from public.fits
    where fits.id = fit_items.fit_id and fits.user_id = (select auth.uid())
  ));

create index if not exists fit_items_fit_id_idx
  on public.fit_items (fit_id);
