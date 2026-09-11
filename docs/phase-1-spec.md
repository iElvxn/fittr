# Fittr Phase 1 Specification

Status: draft for discussion
Source: [Fittr MVP Requirements](../Fittr%20MVP%20Requirements.md)

Phase 1 is the wardrobe and outfit loop with accounts and cloud-backed data, and without the social layer. It exists to test the PRD's core hypothesis:

> People will repeatedly use a digital version of their wardrobe to create, save, plan, and share outfits.

"Share" in Phase 1 means exporting a Fit image to the iOS share sheet. In-app social is Phase 2.

---

## 1. Scope

### In scope

| Area | Phase 1 delivers |
|---|---|
| Accounts | Sign in with Apple, email and password, sign out, delete account, display name, optional avatar |
| Wardrobe | Add items from camera or library, on-device background removal, category, auto-detected editable color, optional name, brand, notes; grid with category filter; item detail; edit; delete |
| Batch add | Select multiple photos from the library in one go and review them as a queue |
| Fits | Create from wardrobe items across categories, collage preview, name, save, edit, delete, favorite, mark as worn |
| My Fits | List with filters All, Favorites, Worn |
| Planner | Weekly calendar, assign a Fit to a day, view, replace, remove; today's planned Fit on the home tab |
| Share | Export a Fit collage as an image to the iOS share sheet |
| Sync | Local-first storage with background sync to Postgres; app fully usable offline |
| Privacy | All data private to the owner; deleting an item, a Fit, or the account removes rows and images |
| Measurement | Funnel analytics events and crash reporting |

### Out of scope for Phase 1

Posts, feed, likes, comments, follows, saves, notifications, discover, search, usernames, AI category detection, outfit recommendations, weather, commerce, Android, web.

---

## 2. Platform and stack

| Layer | Choice |
|---|---|
| App | Expo SDK (latest stable), React Native, TypeScript strict, Expo Router |
| Minimum iOS | 17.0 (required by on-device subject lifting) |
| Local data | expo-sqlite with Drizzle ORM and Drizzle migrations |
| Server data | Supabase Postgres, row-level security, SQL migrations in `supabase/migrations` |
| Auth | Supabase Auth: Sign in with Apple, email and password |
| Images | On-device background removal via a Vision-backed React Native module; expo-image-manipulator for resizing; Supabase Storage behind an `ImageStore` interface |
| State | TanStack Query over the local database; Zustand for UI and Fit-builder session state |
| Canvas | react-native-gesture-handler and react-native-reanimated for drag, pinch, and rotate; react-native-view-shot to export the arranged canvas as an image |
| Styling | NativeWind |
| Testing | Jest with jest-expo; React Native Testing Library; Maestro for three end-to-end flows before launch |
| CI and delivery | GitHub Actions (lint, typecheck, test on every PR); EAS Build and Submit; EAS Update for JS-only fixes |
| Observability | Sentry (crashes), PostHog (product events) |

Constraints: solo developer on Windows, so all native builds run on EAS. Development uses an EAS development build installed on a physical iPhone; Expo Go is not sufficient once the background removal module is added.

---

## 3. Data model

All tables carry `id uuid` (generated on the client), `user_id`, `created_at`, `updated_at`, and `deleted_at` for soft deletes. The same schema exists in SQLite (via Drizzle) and Postgres (via SQL migrations). Client-generated IDs make offline creation and idempotent sync possible.

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
- Deleting an item soft-deletes it and removes it from `fit_items`. A Fit left with zero items remains but shows as empty and prompts the user.
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

---

## 4. Sync design

Local-first. Every read and write in the app targets SQLite. A sync engine reconciles with Postgres in the background.

### Local additions
Each synced table has two extra local-only columns: `dirty boolean` and `synced_at timestamptz null`. A `sync_state` table stores a per-table pull cursor (`last_pulled_updated_at`).

### Push
1. Select rows where `dirty = true`, in dependency order: profiles, wardrobe_items, fits, fit_items, fit_wears, planned_fits.
2. Upsert in batches by primary key. Postgres keeps the incoming row only if its `updated_at` is newer (last-write-wins).
3. On success, clear `dirty` and set `synced_at`.
4. Images: for each item or Fit with a local file not yet uploaded, upload to Storage, then mark the row uploaded. Uploads retry with backoff and never block the UI.

### Pull
1. Per table, select rows where `updated_at > cursor` for this user.
2. Apply with last-write-wins against the local row. Soft deletes propagate as updates.
3. Advance the cursor to the max `updated_at` received.
4. Download images lazily on first display and cache them on disk.

### Triggers
- App launch and foreground.
- After any local write, debounced by a few seconds.
- Pull-to-refresh on the Wardrobe and My Fits screens.
- Network reconnect.

### Conflict policy
Single user, rare multi-device use, so last-write-wins on `updated_at` is acceptable and documented. Clock skew is tolerated. This is a deliberate simplification recorded in the decision log.

### Failure handling
Sync failures are logged to Sentry and surfaced as a small non-blocking indicator. The app never loses local data because of a failed sync.

---

## 5. Image pipeline

1. User picks one or more photos from the library, or captures one or more with the camera (see rapid camera mode below).
2. Each photo is resized to a working size (long edge around 1500 px) on device.
3. On-device background removal produces a PNG with transparency.
4. Dominant color is computed from opaque pixels of the cutout.
5. A thumbnail (long edge around 400 px) is generated.
6. The user reviews cutout, category, and color for each item in the batch, and can retake if removal fails, since the physical item is still available.
7. Cutout and thumbnail are written to the document directory and the item row is saved as dirty. The original photo is discarded at this point; it is never uploaded. Upload of the cutout and thumbnail happens in sync.

Processing runs off the UI thread where the module allows, and batch items process sequentially with a visible queue, one shared queue and review screen for both library multi-select and rapid camera capture.

### Rapid camera mode

The camera view stays open across shots instead of returning to a review screen after each photo. The user lays out several items and taps the shutter once per item; each capture adds a thumbnail to a filmstrip at the bottom of the viewfinder and the camera stays live for the next shot. Review of category, color, and cutout quality happens once, after the user ends the capture session, using the same queue screen as library multi-select.

---

## 6. Screens and flows

### Navigation
Tabs: Home, Wardrobe, Fits, Planner, Profile.

### Auth and onboarding
- Welcome: value proposition in one line, Sign in with Apple, Continue with email.
- Sign up and sign in with email; password reset via email.
- Onboarding: set display name, then a guided "Add your first 5 items" step with a progress indicator. Skippable.

### Home
- Today's planned Fit, or a prompt to plan one.
- Quick actions: Add item, Create Fit.
- Onboarding progress card until the user has 5 items and 1 Fit.

### Wardrobe
- Grid of thumbnails on transparent background, category filter chips, item count.
- Add item button opens a choice of library multi-select or rapid camera capture (see section 5).
- Processing queue screen with per-photo status and a review step for each.
- Item detail: large cutout, category, color, name, brand, notes, "Fits with this item", Create Fit With This, Edit, Delete.

### Fit builder
- Start by choosing a template (e.g. "Top + Bottom + Shoes", "Layered Outerwear", "Blank canvas") that seeds initial position, scale, and stacking order for each category slot it defines.
- A freeform canvas: pick an item from a category tray, it's added to the canvas at its template position (or center, for a blank canvas), and the user can drag, pinch to resize, rotate, and reorder layers freely. Nothing is locked to a slot after placement.
- Multiple items per category allowed, including several accessories.
- Name field with generated default. Save persists each item's `x, y, scale, rotation, z_index`.
- Editing a Fit reopens the canvas with items at their saved positions.
- Save renders the canvas to an image via view-shot for the Fit's cover and for share/export.

### My Fits
- Grid of collage covers, filters All, Favorites, Worn.
- Fit detail: collage, item list, actions Favorite, Wear today, Plan, Share, Edit, Delete.

### Planner
- Week strip with day cells showing the planned Fit's cover.
- Tap a day to pick a Fit, replace, or remove.
- Marking a planned Fit as worn from Home writes a wear row.

### Profile
- Username, display name, avatar, sign out.
- Delete account with confirmation and explanation.

### States
Every list has loading, empty, and error states. Empty states point at the next action in the core loop.

---

## 7. Analytics events

| Event | Properties |
|---|---|
| signed_up | method |
| onboarding_completed | items_added |
| item_added | source (camera, library), category, batch_size |
| item_removal_failed | reason |
| fit_created | item_count, categories, is_first |
| fit_edited | |
| fit_favorited | |
| fit_worn | source (home, detail) |
| fit_planned | days_ahead |
| fit_shared | |
| item_deleted, fit_deleted | |
| sync_failed | stage |
| account_deleted | |

Funnel (from the PRD): signed_up, 5 items, first fit, second fit, worn or planned, returned the following week.

---

## 8. Milestones

| Milestone | Deliverable | Done when |
|---|---|---|
| M0 Foundation | Expo project, Router, NativeWind, Drizzle, CI, Supabase project, schema migrations, RLS, auth screens, PostHog and Sentry wired in | A user can sign up, sign in, sign out on a dev build, and a test event reaches PostHog |
| M1 Wardrobe | Add with background removal, library multi-select and rapid camera capture, shared batch queue, grid, detail, edit, delete, all local | Ten items added from photos in under three minutes, by either capture method |
| M2 Fits | Templates, freeform drag/pinch/rotate canvas, view-shot export, save, My Fits, favorite, wear, share image | A Fit created and freely rearranged from wardrobe items, then shared as an image |
| M3 Planner | Week view, assign, replace, remove, Home today card | A week planned and a Fit marked worn from Home |
| M4 Sync and storage | Push, pull, image upload and download, reinstall restores data | Delete and reinstall the app; everything comes back |
| M5 Launch readiness | Onboarding, analytics, Sentry, delete account, error and empty states, Maestro flows, App Store assets | All launch criteria below pass |
| M6 Cohort | TestFlight to a small cohort, weekly funnel review | Two weeks of data on the funnel |

Sync is built after the local product works, but the schema in M0 already carries the sync columns so nothing is retrofitted.

---

## 9. Launch criteria

Functional
- Sign up, sign in, sign out, delete account all work.
- Items can be added, edited, deleted; background removal is acceptable on typical clothing photos laid flat or on a hanger.
- Fits reference wardrobe items and update when items change.
- Planner assign, replace, remove work.
- Share exports a correct collage image.
- Sync restores all data after reinstall.

Quality
- No crashes in the three Maestro flows.
- Works offline for all wardrobe, Fit, and planner actions.
- Loading, empty, and error states on every screen.
- Supabase free-tier storage usage projected to stay within limits for the cohort.

Product
- Five test users can explain what Fittr is, why to add clothes, how to make a Fit, and why to come back.

---

## 10. Open questions

1. **Template set.** Exact starting templates to ship beyond "Top + Bottom + Shoes", "Layered Outerwear", and "Blank canvas" — finalize once the canvas is built and a few Fits have been made by hand.
2. **Fit with missing items.** Confirmed: when an item is deleted, any Fit using it keeps its other items and shows a visible gap at that canvas position, rather than deleting the Fit. Revisit only if this reads as confusing in testing.

---

## 11. Decisions recorded so far

- Local-first with background sync rather than online-only, for speed, offline use, and a meaningful sync layer.
- Supabase over a custom backend: auth, Postgres, RLS, and storage in one free service; serverless functions only when a secret or trust boundary requires them.
- On-device background removal over an API: free, private, fast.
- Manual category selection in Phase 1; model-based detection deferred until it can sit behind a server function.
- Supabase Storage behind an `ImageStore` interface so S3 or R2 can replace it later.
- No Redis, queues, or streaming in Phase 1. Thresholds for adding them will be recorded when Phase 2 fan-out arrives.
- Last-write-wins sync conflicts, documented as a deliberate simplification.
- Fit layout is a freeform drag/pinch/rotate canvas seeded by templates, not fixed slots, matching the standard in this app category (Whering, Stylebook, Acloset).
- Both library multi-select and rapid camera capture ship in Phase 1, sharing one batch queue and review screen.
- Usernames are collected at onboarding, unique and indexed, even though Phase 1 UI doesn't surface them beyond profile settings.
- The original photo is discarded once the cutout is confirmed and is never uploaded. Re-photographing a poor cutout costs nothing since the physical item is still available, so retention for later re-processing was cut as speculative scope that doesn't serve the hypothesis test.
- Data export was considered and cut from Phase 1. Sync already covers restore-after-reinstall, and account deletion already covers the PRD's privacy requirement; export added a legal/trust rationale without an actual tester need behind it. Revisit in Phase 2 or if a tester asks for it.
- PostHog analytics ship from M0, not after launch, since Phase 1's funnel data can't be reconstructed retroactively.
