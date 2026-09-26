-- Story 5.1: Plan Fits for the Week
-- `planned_fits` table -- at most one Fit per user per calendar day. A plan
-- is a lightweight pointer like a `fit_wears` row, so it differs from the
-- epic's draft in two deliberate ways (see the story spec's Design Notes):
--
-- 1. No `deleted_at`. Removing a plan is a hard delete, and a plan whose Fit
--    was soft-deleted simply reads as an empty day (the app joins plans
--    against its live Fits list), so there's nothing to soft-delete. It also
--    keeps `(user_id, planned_on)` a plain unique constraint the client can
--    upsert on, rather than a partial unique index PostgREST can't target.
-- 2. `id` is server-generated. Assign and replace are one upsert on
--    `(user_id, planned_on)`; a client-sent id would rewrite the primary key
--    on every replace.
--
-- `planned_on` is the device-local calendar date (`lib/fits/localDate.ts`),
-- same convention as `fit_wears.worn_on`.

create table if not exists public.planned_fits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  fit_id uuid not null references public.fits (id) on delete cascade,
  planned_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, planned_on)
);

comment on table public.planned_fits is
  'The Fit a user plans to wear on a given day, at most one per user per '
  'day. Removing a plan hard-deletes its row; a plan whose Fit is '
  'soft-deleted is treated as empty by the app, not cleaned up here.';

alter table public.planned_fits enable row level security;

create policy "planned_fits_select_own"
  on public.planned_fits
  for select
  using (user_id = (select auth.uid()));

-- Insert and update also require the Fit to be the caller's own live Fit,
-- so a plan can't point at someone else's Fit (whose id would otherwise
-- satisfy the FK) or at one already deleted. The client's upsert runs as
-- INSERT ... ON CONFLICT DO UPDATE, so a replace passes through both.
create policy "planned_fits_insert_own"
  on public.planned_fits
  for insert
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.fits
      where fits.id = planned_fits.fit_id
        and fits.user_id = (select auth.uid())
        and fits.deleted_at is null
    )
  );

create policy "planned_fits_update_own"
  on public.planned_fits
  for update
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.fits
      where fits.id = planned_fits.fit_id
        and fits.user_id = (select auth.uid())
        and fits.deleted_at is null
    )
  );

create policy "planned_fits_delete_own"
  on public.planned_fits
  for delete
  using (user_id = (select auth.uid()));

-- Keep `updated_at` current on every UPDATE (a replace) -- reuses the
-- function `profiles` already defined in 0001_profiles.sql.
create trigger planned_fits_set_updated_at
  before update on public.planned_fits
  for each row
  execute function public.set_updated_at();

-- The Planner's week read (`user_id`, `planned_on` range) is already served
-- by the unique constraint's own index, which leads with `user_id`. This one
-- serves `fits`' `on delete cascade` into this table, same "index every FK
-- column a cascade can hit" discipline as `fit_wears_fit_id_idx`.
create index if not exists planned_fits_fit_id_idx
  on public.planned_fits (fit_id);
