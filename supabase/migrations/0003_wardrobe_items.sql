-- Story 2.1: Add a Single Wardrobe Item
-- `wardrobe_items` table + explicit per-operation row-level security.
--
-- `id` is a client-generated uuid (same convention as `profiles.id`), not a
-- default-generated one -- the client needs the id before the row exists so
-- it can derive the Storage path (`{uid}/items/{itemId}/...`) and upload
-- ahead of the insert.
--
-- `category` is `text` + a `check` constraint against the fixed enum, not a
-- native Postgres `enum` type -- per the spec, this keeps future category
-- additions (or Epic 6 changes) a plain migration instead of the more
-- involved `alter type ... add value` dance.
--
-- RLS: explicit per-operation policies, mirroring `profiles`' pattern
-- (0001_profiles.sql). Unlike `profiles`, every `auth.uid()` call here is
-- wrapped in `(select auth.uid())` -- Supabase's RLS-performance guidance --
-- since items are scanned per-row (grid reads, filters) far more often than
-- the single-row `profiles` table.
--
-- No DELETE policy: item removal is a soft delete via `deleted_at`
-- (an UPDATE), matching `profiles`' "no client-side DELETE" precedent.
-- Delete UI itself is Story 2.4's scope, not this migration's.
--
-- cutout_path/thumb_path carry a check constraint tying them to the row's
-- own user_id/id rather than trusting client-supplied text verbatim: RLS
-- on this table only checks user_id, not that these path columns actually
-- point into that same user's Storage folder. Storage's own RLS
-- (0002_avatar_storage.sql) already re-derives the real object path
-- independent of this column, so this isn't fixing a live read exploit --
-- it's closing off a future feature (e.g. a batch signed-URL generator)
-- that might trust these columns directly without re-deriving the path.

create table if not exists public.wardrobe_items (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('top', 'bottom', 'shoes', 'outerwear', 'accessory')),
  name text,
  brand text,
  notes text,
  color_hex text,
  cutout_path text not null check (cutout_path = user_id::text || '/items/' || id::text || '/cutout.png'),
  thumb_path text not null check (thumb_path = user_id::text || '/items/' || id::text || '/thumb.webp'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.wardrobe_items is
  'One row per captured clothing item. cutout_path/thumb_path point at the '
  '`wardrobe` Storage bucket under {user_id}/items/{id}/. deleted_at is a '
  'soft delete -- the row is never hard-deleted.';

alter table public.wardrobe_items enable row level security;

-- SELECT: a user can only read their own items.
create policy "wardrobe_items_select_own"
  on public.wardrobe_items
  for select
  using (user_id = (select auth.uid()));

-- INSERT: a user can only create items owned by themselves.
create policy "wardrobe_items_insert_own"
  on public.wardrobe_items
  for insert
  with check (user_id = (select auth.uid()));

-- UPDATE: a user can only update their own items, and can't reassign
-- ownership in the process. Covers both field edits (Story 2.4) and the
-- soft-delete (`deleted_at`) write.
create policy "wardrobe_items_update_own"
  on public.wardrobe_items
  for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Deliberately no DELETE policy: removal is the soft-delete UPDATE above,
-- never a client-side hard delete.

-- Keep `updated_at` current on every UPDATE -- reuses the function
-- `profiles` already defined in 0001_profiles.sql.
create trigger wardrobe_items_set_updated_at
  before update on public.wardrobe_items
  for each row
  execute function public.set_updated_at();

-- Every read scans by owner; Story 2.3's grid additionally filters out
-- soft-deleted rows, so a partial index on that shape avoids scanning
-- tombstones on every load.
create index if not exists wardrobe_items_user_id_idx
  on public.wardrobe_items (user_id);

create index if not exists wardrobe_items_user_id_not_deleted_idx
  on public.wardrobe_items (user_id)
  where deleted_at is null;
