# Epic 2 Context: Wardrobe Capture & Management

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let a user turn their physical wardrobe into a digital one: add clothing items one at a time or in a batch (library multi-select or rapid camera capture), have each photo's background removed on-device and its dominant color auto-detected, then browse the resulting items as a filterable grid and view, edit, or delete any of them. This is the first epic where real user content (photos) flows through the app and into Supabase Storage/Postgres, and it establishes the image pipeline, storage layout, and item data model that Fit building (Epic 3) depends on directly.

## Stories

- Story 2.1: Add a Single Wardrobe Item
- Story 2.2: Batch-Add Items via Library Multi-Select or Rapid Camera
- Story 2.3: Browse and Filter the Wardrobe
- Story 2.4: View, Edit, and Delete an Item

## Requirements & Constraints

- Category is always a manual choice from a fixed set (top, bottom, shoes, outerwear, accessory) — no AI-based category detection in Phase 1, deliberately, to keep AI limited to friction removal (background removal) rather than becoming the core experience.
- Dominant color is auto-detected from the cutout's opaque pixels but must remain user-editable.
- Name, brand, and notes are always optional.
- The original photo is discarded once the cutout is confirmed and is never uploaded or retained; a poor cutout is fixed by retaking the photo, not by a reprocessing feature.
- Background removal runs on-device (Vision-backed), never via a network API — for cost, privacy, and speed.
- Library multi-select and rapid camera capture must feed the same shared queue-and-review screen as the single-item flow; each item in a batch is individually confirmable or retakeable before the whole batch saves.
- Success bar for this epic (NFR10 / CAP-2, CAP-3): ten items can be added from photos in under three minutes, by either capture method, with acceptable background-removal quality on clothing laid flat or on a hanger.
- No-connection save failure is block-and-keep, same pattern as the rest of the app: show "No connection — nothing was lost. Try again," keep the user on the unsaved screen with input/captured photos intact, offer retry — no silent background queue, since there's no local-first layer in Phase 1.
- Deleting an item is a soft delete (`deleted_at`) that removes it from the Wardrobe grid and from any Fit's item placements; the Fit itself is untouched beyond that gap (full behavior verified once Epic 3 exists).
- All wardrobe data is private per-user (RLS scoped to `auth.uid()`/`user_id`), continuing the pattern established in Epic 1 — not something this epic introduces, but binding on the new `wardrobe_items` table and its Storage objects.
- Instrument `item_added` (source: camera/library, category, batch_size), `item_removal_failed` (reason), and `item_deleted` events for PostHog, continuing Epic 1's analytics plumbing.

## Technical Decisions

- Image pipeline (client-side, sequential per batch item, off the UI thread where the module allows): resize to a working size (~1500px long edge) via `expo-image-manipulator` → on-device background removal (Vision-backed RN module, requires iOS 17+ and an EAS dev build — Expo Go can't host it, same constraint as Google Sign-In) → dominant-color detection from the cutout's opaque pixels → thumbnail generation (~400px long edge) → user review (cutout/category/color, retake option) → direct upload to Supabase Storage + insert into Postgres. No local-first save step.
- `wardrobe_items` table: `id` (client-generated uuid), `user_id`, `category` (enum: top/bottom/shoes/outerwear/accessory), `name`/`brand`/`notes` (nullable), `color_hex` (nullable, editable), `cutout_path` (PNG with transparency), `thumb_path` (small JPEG/PNG for grids), `created_at`/`updated_at`/`deleted_at`. RLS: explicit per-operation policies (`USING (user_id = auth.uid())` for SELECT/UPDATE/DELETE, `WITH CHECK (user_id = auth.uid())` for INSERT/UPDATE), not one blanket rule.
- Storage layout: `wardrobe/{user_id}/items/{item_id}/cutout.png` and `wardrobe/{user_id}/items/{item_id}/thumb.jpg`, under the same per-user prefix convention Epic 1 established for avatars; the Storage bucket policy requires the object path to start with `auth.uid()/`.
- Supabase Storage access goes through an `ImageStore` interface so the backend (e.g. S3, R2) can be swapped later — this epic's uploads/reads should call through it, not the Supabase Storage SDK directly.
- State: TanStack Query for the wardrobe grid/item reads-writes against Supabase directly (no local cache-of-record); Zustand for any in-progress batch-queue/session state during capture and review.
- Client-generated UUIDs are used throughout (same convention as `profiles.id`), which lets the client reference an item's storage path before the row exists — useful for the upload-then-insert sequencing in the pipeline above.
- No AI-based category-detection service and no server function for this epic — deferred until it can sit behind a server boundary; category stays a manual, client-only selection.

## UX & Interaction Patterns

- Wardrobe grid: thumbnails on a transparent background (no card chrome, no shadow on photography), a visible item count, and category filter chips; a chip may appear as a small `surface-raised` pill overlay on a grid cell at 90% opacity. Empty state: "Add your first item." pointing at the add-item flow. Loading: a skeleton grid matching the eventual layout, never a bare spinner.
- Add-item flow (single): capture/pick → resize → cutout → category (manual) + color (auto, editable) → optional name/brand/notes → save. Poor cutout → retake, no reprocessing option shown.
- Batch queue: one shared queue/review screen for both library multi-select and rapid camera. In rapid-camera mode the camera view stays open across shots, each capture adds a thumbnail to a filmstrip at the bottom of the viewfinder, and category/color/cutout review for the whole batch happens once at the end in that same queue screen.
- Item detail: photo dominates the top of the screen edge-to-edge (minus gutter), metadata (`body`/`meta` type) below, actions as a row of secondary/icon buttons beneath — category, color, name/brand/notes, "Fits with this item," and "Create Fit With This." Delete always goes through a confirmation step (native iOS action sheet), never a list-row swipe — swipe-to-delete is explicitly not used in Phase 1.
- Voice: short, complete sentences, no exclamation marks; failure copy follows the established "No connection — nothing was lost. Try again." pattern, not a generic "Network error."
- Visual language stays pure monochrome (no accent color); favorited/selected/active states are shown by weight or fill-vs-outline, never by color. Touch targets ≥44×44pt on every grid cell and control, using `hitSlop` where the cutout itself is visually smaller. Pull-to-refresh is available on the Wardrobe grid as a standard native affordance (not required for correctness — data is always live from Supabase).

## Cross-Story Dependencies

- Story 2.1 builds the single-item capture → review → save pipeline and the shared queue/review screen; Story 2.2 reuses that same screen for both library multi-select and rapid-camera batches rather than building a separate flow.
- Story 2.3's grid and Story 2.4's item detail both depend on items existing from 2.1/2.2 — there's no synthetic/seed data path implied anywhere in the source material.
- Story 2.4's "Create Fit With This" action and any item's appearance in a Fit's item list are *enabled* by Epic 3 but don't require Epic 3 to exist for 2.4 to be built or tested (same forward-dependency pattern epics.md approves elsewhere).
- Story 2.4's delete-item gap behavior (remaining Fit items keep their positions, deleted item's canvas slot shows a visible gap) is only fully verifiable once Epic 3's Fit canvas and `fit_items` table exist; this epic covers the wardrobe-side soft delete only.
- This epic reuses Epic 1's RLS pattern, per-user Storage prefix convention, and direct-Supabase/no-offline architecture rather than introducing new ones.
