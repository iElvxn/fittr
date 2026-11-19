-- Saving a Fit used to be separate client requests: `fits`, then `fit_items`,
-- then a delete of removed placements. A failed `fit_items` write during an
-- edit left the new name and cover on the row, and the client's rollback then
-- deleted the new cover files and soft-deleted the existing Fit. This function
-- does all three writes in one transaction, so a failed save changes nothing.
--
-- `security invoker`: nothing here needs to bypass RLS, so the existing `fits`
-- and `fit_items` policies and check constraints still decide every write, and
-- a bug in this function can't reach another account. The owner comes from
-- `auth.uid()`, never from an argument. `search_path = ''` with
-- schema-qualified names rules out a search_path hijack.
--
-- Not `strict`: `p_canvas_background_color` is legitimately null. `strict`
-- would make every such call a silent no-op.
--
-- `p_items` is checked before any write: a SQL NULL reads as zero rows, which
-- would otherwise delete every placement and report success.
--
-- The `fits` upsert must stay the first write. It takes the row lock, so two
-- saves of one Fit run in turn and a concurrent soft delete is re-checked.
-- `deleted_at` is deliberately left out of the `set` list: a save never brings
-- back a soft-deleted Fit, and `found` is false when the `where` filters the
-- row out. `is_favorite` and `user_id` are left out too.
--
-- `fit_id` is left out of the `fit_items` `set` list, and the row count check
-- turns a placement id that already belongs to another Fit into an error,
-- rather than moving it or overwriting it. Both rejections share one message.
-- Another user's live Fit fails RLS with its own code instead, which only
-- matters to a caller who already holds that Fit's unguessable uuid.
--
-- Cover files stay outside this transaction: the client uploads them first,
-- and `insertFit` only removes the previous pair once this function has
-- returned.

create or replace function public.save_fit(
  p_fit_id uuid,
  p_name text,
  p_cover_path text,
  p_cover_thumb_path text,
  p_canvas_background_color text,
  p_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_saved integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid items' using errcode = '22023';
  end if;

  insert into public.fits (id, user_id, name, cover_path, cover_thumb_path, canvas_background_color)
  values (p_fit_id, auth.uid(), p_name, p_cover_path, p_cover_thumb_path, p_canvas_background_color)
  on conflict (id) do update set
    name = excluded.name,
    cover_path = excluded.cover_path,
    cover_thumb_path = excluded.cover_thumb_path,
    canvas_background_color = excluded.canvas_background_color
  where public.fits.deleted_at is null;

  if not found then
    raise exception 'fit not saved' using errcode = 'P0002';
  end if;

  delete from public.fit_items
  where fit_id = p_fit_id
    and id not in (select (item ->> 'id')::uuid from jsonb_array_elements(p_items) as item);

  insert into public.fit_items (id, fit_id, item_id, x, y, scale, rotation, z_index)
  select t.id, p_fit_id, t.item_id, t.x, t.y, t.scale, t.rotation, t.z_index
  from jsonb_to_recordset(p_items)
    as t(id uuid, item_id uuid, x real, y real, scale real, rotation real, z_index integer)
  on conflict (id) do update set
    item_id = excluded.item_id,
    x = excluded.x,
    y = excluded.y,
    scale = excluded.scale,
    rotation = excluded.rotation,
    z_index = excluded.z_index
  where public.fit_items.fit_id = excluded.fit_id;

  get diagnostics v_saved = row_count;
  if v_saved <> jsonb_array_length(p_items) then
    raise exception 'fit not saved' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.save_fit(uuid, text, text, text, text, jsonb) is
  'Saves one Fit and replaces its placements in a single transaction, as the '
  'calling user. p_items is a JSON array of {id, item_id, x, y, scale, '
  'rotation, z_index}. Never restores a soft-deleted Fit.';

-- `public` by Postgres's default, `anon` by Supabase's default privileges.
revoke execute on function public.save_fit(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.save_fit(uuid, text, text, text, text, jsonb) to authenticated;

-- Fires on commit. This is the app's first RPC, so don't leave it to the
-- schema cache: `PGRST202` right after applying would look like a bad deploy.
notify pgrst, 'reload schema';
