-- Story 4.1: Browse and Filter My Fits
-- `fit_wears` table -- one row per dated wear event, per `data-model.md`'s
-- canonical columns. "Worn" is derived: a Fit counts as worn once it has at
-- least one row here, never a stored boolean (see `0004_fits.sql`'s
-- `is_favorite` for the same "add the column/table ahead of its own write
-- UI" precedent).
--
-- Nothing writes to this table until Story 4.2's "mark worn" action -- this
-- story only reads it (the Worn filter), so it's correctly always-empty for
-- now. RLS is scoped for both directions already so 4.2 needs no migration
-- of its own to start writing.

create table if not exists public.fit_wears (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  fit_id uuid not null references public.fits (id) on delete cascade,
  worn_on date not null,
  created_at timestamptz not null default now(),
  unique (user_id, fit_id, worn_on)
);

comment on table public.fit_wears is
  'One row per dated wear event for a Fit. "Worn" and the wear-streak (Epic '
  '4) are both derived by querying this table, never a stored flag. The '
  '(user_id, fit_id, worn_on) unique constraint keeps a double-tap on a '
  'future "mark worn" action from inflating Story 4.4''s streak count with '
  'duplicate same-day rows.';

alter table public.fit_wears enable row level security;

create policy "fit_wears_select_own"
  on public.fit_wears
  for select
  using (user_id = (select auth.uid()));

create policy "fit_wears_insert_own"
  on public.fit_wears
  for insert
  with check (user_id = (select auth.uid()));

create index if not exists fit_wears_user_id_fit_id_idx
  on public.fit_wears (user_id, fit_id);

-- Separate from the composite index above (which leads with user_id, not
-- fit_id) -- this one serves `fits`' `on delete cascade` into this table,
-- same "index every FK column a cascade can hit" discipline as
-- `fit_items_fit_id_idx` in `0004_fits.sql`.
create index if not exists fit_wears_fit_id_idx
  on public.fit_wears (fit_id);
