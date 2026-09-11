# Data model

All tables carry `id uuid` (generated on the client), `user_id`, `created_at`, `updated_at`, and `deleted_at` for soft deletes, in Postgres via SQL migrations — there is no local SQLite mirror in Phase 1. Client-generated IDs still simplify idempotent inserts and let the client reference an item's or Fit's storage path before the row exists.

### profiles
| Column | Type | Notes |
|---|---|---|
| id | uuid | Equals `auth.users.id` |
| username | text | Unique, lowercase, set at onboarding; not surfaced in Phase 1 UI beyond profile settings |
| display_name | text | Required |
| avatar_path | text null | Storage object path |
| created_at, updated_at | timestamptz | |

### wardrobe_items
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| category | enum | `top`, `bottom`, `shoes`, `outerwear`, `accessory` |
| name | text null | |
| brand | text null | |
| color_hex | text null | Dominant color from the cutout, user-editable |
| notes | text null | |
| cutout_path | text | PNG with transparency |
| thumb_path | text | Small JPEG or PNG for grids |
| created_at, updated_at, deleted_at | timestamptz | |

The original photo is discarded once the user confirms the cutout. If a cutout is poor, the user re-takes the photo, since the physical item is still available; there is no re-processing feature in Phase 1.

### fits
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| name | text | Defaults to a generated name such as "Fit 12" |
| is_favorite | boolean | |
| cover_path | text null | Rendered collage, regenerated on edit |
| created_at, updated_at, deleted_at | timestamptz | |

### fit_items
Freeform canvas placement, not a fixed slot. Each row is one item placed on a Fit's canvas.

| Column | Type | Notes |
|---|---|---|
| fit_id | uuid | |
| item_id | uuid | |
| x, y | real | Center position as a fraction of canvas width/height (0 to 1), so it renders at any screen size |
| scale | real | Relative to the item's default render size |
| rotation | real | Degrees |
| z_index | int | Stacking order, also used for layer list and delete-top-item gestures |
| Primary key | (fit_id, item_id) | |

A template only supplies the initial `x, y, scale, rotation, z_index` values when items are added to a new Fit; nothing distinguishes a "templated" item from a manually placed one afterward.

### fit_wears
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| fit_id | uuid | |
| worn_on | date | |
| created_at | timestamptz | |

"Worn" on a Fit is derived: it has at least one wear row.

### planned_fits
| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| user_id | uuid | |
| fit_id | uuid | |
| planned_on | date | Unique per user and day |
| created_at, updated_at, deleted_at | timestamptz | |

### Referential rules
- Deleting an item soft-deletes it and removes it from `fit_items`. A Fit that still has other items keeps them and shows a visible gap at the removed item's canvas position, rather than the Fit being deleted. A Fit left with zero items remains but shows as empty and prompts the user.
- Deleting a Fit soft-deletes it and its `planned_fits` rows. Wear history is kept for metrics.
- Deleting the account hard-deletes all rows and all storage objects under the user's prefix, then the auth user.

### Row-level security
Every table: `user_id = auth.uid()` for select, insert, update, delete. `profiles`: `id = auth.uid()`. Storage bucket `wardrobe`: object path must start with `auth.uid()/`.

### Storage layout
```
wardrobe/{user_id}/items/{item_id}/cutout.png
wardrobe/{user_id}/items/{item_id}/thumb.jpg
wardrobe/{user_id}/fits/{fit_id}/cover.png
wardrobe/{user_id}/avatar.jpg
```
