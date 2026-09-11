-- Story 1.1: Sign Up for an Account
-- profiles table + explicit per-operation row-level security.
--
-- `username` and `display_name` are NOT NULL and populated at row-creation
-- time (system-generated username, placeholder display name) — never left
-- for a later step to fill. Story 1.3 (onboarding) overwrites `display_name`.
--
-- The row is created by an `auth.users` trigger (below), not a separate
-- client-side insert — a crash or lost connection between "auth account
-- created" and a second client call would otherwise leave an orphaned
-- auth.users row with no profile. The trigger runs in the same transaction
-- as account creation, so this is atomic: either both rows exist, or
-- neither does.
--
-- RLS: explicit per-operation policies, never one blanket rule.
-- `USING` alone does not constrain what a client can write, so INSERT/UPDATE
-- get an explicit `WITH CHECK` in addition to `USING` on UPDATE/SELECT.
-- No client-side DELETE policy: account deletion is a service-role
-- operation (Epic 6), not something this table's client-facing policies
-- need to allow.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text not null,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth.users row. username is system-generated/immutable; '
  'display_name starts as a sign-up-time placeholder overwritten during onboarding.';

alter table public.profiles enable row level security;

-- SELECT: a user can only read their own row.
create policy "profiles_select_own"
  on public.profiles
  for select
  using (id = auth.uid());

-- INSERT: a user can only create their own row (id must equal their own uid).
create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (id = auth.uid());

-- UPDATE: a user can only update their own row, and can't reassign it to
-- someone else's id in the process.
create policy "profiles_update_own"
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Deliberately no DELETE policy: account deletion is a service-role
-- operation (Epic 6), never a client-side capability.

-- Keep `updated_at` current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Auto-create the profiles row in the same transaction as account creation.
-- `security definer` + a pinned `search_path` so this runs with the
-- function owner's privileges (bypassing RLS, which is required here since
-- there is no authenticated `auth.uid()` yet at the instant the row is
-- created) without being vulnerable to a search_path hijack.
--
-- username is generated here (not passed from the client) using only core
-- Postgres functions (`random()`, `md5()`, `clock_timestamp()`) — no
-- extension dependency. display_name is always the generic placeholder;
-- a nicer provider-supplied name (Apple's fullName, Google's given/family
-- name) is applied client-side as a best-effort UPDATE after sign-in
-- succeeds, since it's cosmetic only and Story 1.3's onboarding overwrites
-- it regardless. On the astronomically unlikely username collision, the
-- whole trigger — and therefore the whole auth.users insert — rolls back,
-- so sign-up fails atomically rather than leaving a half-created account.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'user_' || substr(md5(random()::text || clock_timestamp()::text), 1, 10),
    'New Fittr user'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
