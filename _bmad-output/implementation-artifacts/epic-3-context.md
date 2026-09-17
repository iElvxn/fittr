# Epic 3 Context: Fit Building

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic lets users compose outfits ("Fits") from their wardrobe items. A user starts from a template (which seeds initial item placement) or a blank canvas, freely arranges items with drag/pinch/rotate/reorder, previews the result as a rendered collage, names and saves it, can reopen and edit it later, and can delete it. It also defines how a Fit behaves when one of its items is later removed from the wardrobe — the Fit survives with a visible gap rather than breaking. This is the core outfit-creation loop the rest of the app (browsing, sharing, planning) builds on.

## Stories

- Story 3.1: Build a Fit on the Canvas
- Story 3.2: Preview, Name, and Save a Fit
- Story 3.3: Edit and Delete a Fit
- Story 3.4: Fit Behavior When a Wardrobe Item Is Deleted

## Requirements & Constraints

- Two starting points for a new Fit: a template ("Top + Bottom + Shoes", "Layered Outerwear") that seeds each category slot with initial position/scale/stacking order, or a blank canvas that starts empty.
- Once placed, an item is never locked to its template slot — it can be freely dragged, pinch-resized, rotated, and reordered (z-index) immediately.
- No fixed-slot limit: multiple items per category, including several accessories, can be added.
- A Fit must be previewable as a rendered collage before saving, and nameable (or default to a generated name like "Fit 12") at save time.
- Saved Fit data persists per-item placement: `x, y, scale, rotation, z_index`.
- Deleting a Fit also soft-deletes any `planned_fits` rows referencing it, but the Fit's wear history is preserved.
- If a wardrobe item used in a Fit is deleted, the Fit keeps its other items and shows a visible gap at that item's canvas position; it is never itself deleted as a side effect. A Fit reduced to zero items still exists, displays as empty, and prompts the user to add items.
- All Fit data is private to its owner (no cross-user access) and requires live network connectivity to read or write — there is no offline mode or local queueing in Phase 1.
- Ten wardrobe items must be addable in under three minutes elsewhere in the app (Epic 2), but the Fit builder itself has no equivalent hard timing requirement.

## Technical Decisions

- New tables: `fits` and `fit_items`, both RLS-scoped to `user_id = auth.uid()`. `fit_items` stores freeform per-item `x, y, scale, rotation, z_index`. Both are soft-deleted (`deleted_at`), consistent with every table except account deletion.
- The rendered collage is stored as the Fit's `cover_path` (uploaded to Supabase Storage) at save time.
- Canvas gestures (drag, pinch-resize, rotate, reorder) are implemented with `react-native-gesture-handler` and `react-native-reanimated`.
- Collage rendering for preview and save uses `react-native-view-shot`.
- Reads/writes go directly against Supabase (Postgres + Storage) via TanStack Query; no custom backend endpoint for Fit CRUD.
- In-progress canvas/session state (item placements before save) is held in Zustand, not persisted until an explicit save.
- Styling via NativeWind.

## UX & Interaction Patterns

- Canvas is a full-bleed `surface-base` area; items float on it as bare cutouts with no per-item card background or shadow. A selected item is indicated by a solid 2px ink-primary outline only — never a shadow or scale change, since that would compete with the drag/rotate gesture itself. Visual reference: `mockups/fit-builder-canvas.html` (template picker + populated canvas states; its black selection outline supersedes an earlier gold draft).
- The Fit-builder canvas is the one surface in the app with rich gesture input (drag/pinch/rotate); every other surface uses plain tap/scroll. Long-press and swipe-to-delete are not used anywhere in Phase 1.
- Touch targets on the canvas must be ≥44×44pt (use `hitSlop` where the cutout itself is visually smaller).
- Dynamic Type must be verified at the largest accessibility size with no truncation/overlap, specifically called out for the canvas since item labels can sit over photography.
- Reduce Motion: skip any press-spring/canvas animation easing and show end states immediately.
- Save-failure behavior (no connection) is block-and-keep: show "No connection — nothing was lost. Try again.", keep the user on the unsaved canvas/preview with input intact, and offer a retry — no silent background queue.
- Empty/removed-item state: remaining items keep their canvas positions; the removed item's spot shows a visible gap, not a collapsed or reflowed layout.
- Microcopy tone: short, complete sentences, no exclamation marks or gamified phrasing (e.g. "Fit saved." not "Yay! Your Fit is saved! 🎉").

## Cross-Story Dependencies

- Depends on Epic 2 (Wardrobe): items must already exist to populate the category tray, and Story 2.4's "Create Fit With This" action and item-deletion flow are entry points into this epic's Story 3.1 and 3.4 respectively.
- Story 3.2's acceptance criteria note the saved Fit appearing in My Fits is only fully verifiable once Epic 4 (My Fits grid) exists — a forward, non-blocking dependency approved at the epic-sequencing level.
- Story 3.3's Fit deletion cascades into Epic 5's `planned_fits` table (removing assignments) while leaving Epic 4's `fit_wears` history untouched.
