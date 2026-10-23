-- Story 6.12: new items store their cutout as a WebP with transparency
-- (`cutout.webp`, encoded on-device, same dimensions) instead of a lossless
-- PNG, to cut storage and egress per item. Items saved before this story
-- keep their `cutout.png` -- no backfill -- so the check now accepts either
-- extension, still pinned to the row's own user/item folder. Existing rows
-- validate unchanged.
--
-- 0003's check is inline and references three columns, so Postgres
-- auto-named it `wardrobe_items_check[N]`, not `..._cutout_path_check`
-- (0007's lesson). Rather than guess the suffix, the old check is found by
-- its definition and dropped, then re-added under an explicit name. RLS is
-- unchanged.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.wardrobe_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%cutout_path%'
  loop
    execute format('alter table public.wardrobe_items drop constraint %I', constraint_name);
  end loop;
end
$$;

alter table public.wardrobe_items
  add constraint wardrobe_items_cutout_path_check
  check (
    cutout_path = user_id::text || '/items/' || id::text || '/cutout.png'
    or cutout_path = user_id::text || '/items/' || id::text || '/cutout.webp'
  );

comment on column public.wardrobe_items.cutout_path is
  'Path in the `wardrobe` Storage bucket of the item''s transparent cutout: '
  '{user_id}/items/{id}/cutout.webp for items saved since Story 6.12, '
  '{user_id}/items/{id}/cutout.png for older ones (no backfill). '
  'Write-once; readers use this column as-is and never assume an extension.';
