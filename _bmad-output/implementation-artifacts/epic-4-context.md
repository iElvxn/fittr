# Epic 4 Context: My Fits & Sharing

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic turns saved Fits (built in Epic 3) into a browsable, trackable collection. A user can see every saved Fit in a filterable grid (All / Favorites / Worn), mark a Fit as a favorite, mark one as worn (which quietly builds a wear-streak counter), and export a Fit's collage to the iOS share sheet for use outside the app. It's the layer that makes a saved Fit useful day-to-day rather than a one-time creation.

## Stories

- Story 4.1: Browse and Filter My Fits
- Story 4.2: Favorite a Fit and Mark It Worn
- Story 4.3: Share a Fit
- Story 4.4: See Your Wear Streak

## Requirements & Constraints

- The Fits grid must support three filters — All, Favorites, Worn — with Favorites and Worn each narrowing to a subset and All showing everything.
- "Worn" is a derived status: a Fit counts as worn once it has at least one wear record, not a separate stored flag.
- Favoriting is a simple toggle with no confirmation step, distinct from destructive actions (which always require confirmation elsewhere in the app).
- Marking a Fit worn records a dated wear entry; this same entry must also support Epic 5's "mark worn from Home" action and this epic's streak calculation — one write path, multiple readers.
- The wear streak counts consecutive calendar days (including today) with at least one wear entry; a gap resets the streak to 1 on the next wear rather than continuing a broken chain, and the displayed streak reflects the last completed streak (doesn't drop to 0 just because today hasn't been logged yet).
- No notifications or reminders are tied to the streak — it is a passive, quiet display only, consistent with the product's no-notifications stance.
- Sharing must hand off a fully-rendered collage image (no partial/placeholder image) to the native iOS share sheet.
- All Fit and wear data is private per-owner and requires live network connectivity — there is no offline mode or local queueing.
- Ten-items-in-three-minutes (NFR10) and other Epic 2 timing constraints don't apply here; this epic has no equivalent hard timing requirement.

## Technical Decisions

- New table: `fit_wears`, RLS-scoped to `user_id = auth.uid()` (consistent with every other table). Each row is a dated wear event for a Fit; "worn" and the streak are both derived by querying this table, not by a stored boolean.
- Reads/writes go directly against Supabase (Postgres) via TanStack Query — no custom backend endpoint for favoriting, wear-logging, or streak computation.
- The share action reuses the Fit's already-rendered collage (the `cover_path` image produced and stored at save time in Epic 3) rather than re-rendering — pass its local/remote image reference straight to the native iOS share sheet.
- Styling via NativeWind, consistent with the rest of the app.

## UX & Interaction Patterns

- My Fits grid cells show the collage cover image directly — transparent background, no card chrome, no shadow on the photography itself. A filter chip may appear as a small overlay pill (`surface-raised` at ~90% opacity) on a cell.
- Favorite indicator: thin outline heart (`ink-secondary`) when inactive, filled solid heart (`ink-primary`) when active — state is shown by outline-vs-filled, never by introducing color. Tapping toggles immediately, no confirmation.
- Wear-streak counter: `label`-type text in `ink-primary`, a plain numeral plus "day streak" — no flame/fire iconography, no celebratory animation or color flourish beyond the number updating. VoiceOver must announce it as "N day streak," not the bare number. Under Reduce Motion, skip any increment animation and show the end state immediately.
- Loading state for the grid is a skeleton grid matching the eventual layout, never a bare spinner. Empty state: "Build your first Fit." pointing at the Fit builder. Pull-to-refresh is available as a standard native affordance (data is always live).
- Sharing and destructive confirmations use native iOS sheets only — no custom-built share or confirmation UI.
- No-connection behavior on a write (favorite toggle, mark worn) follows the app-wide block-and-keep pattern: clear retry messaging, no silent background queue, no loss of the user's action; a failed background sync elsewhere shows only a small non-blocking indicator, never a modal.
- Microcopy stays short, plain, and exclamation-free (e.g. "3-day streak," not "🔥 You're on fire!"); this app has no accent color, so all state (favorited, filter selection, streak) is communicated through weight and fill-vs-outline only.
- Touch targets (grid cells, favorite heart, filter chips) must be ≥44×44pt, using `hitSlop` where the visual element is smaller.

## Cross-Story Dependencies

- Depends on Epic 3: Fits and their `cover_path` collage must already exist for the grid, detail view, and share action to have anything to show.
- Story 4.2's `fit_wears` write is the single source of truth that Story 4.1's Worn filter, Story 4.4's streak, and Epic 5's Story 5.2 ("mark worn" from Home) all read from — building the write path once here, correctly, avoids rework in Epic 5.
- Story 4.4's streak has no meaning until Story 4.2 exists and has produced at least one wear entry.
- Story 4.3 (Share) depends only on a Fit already having a rendered cover image from Epic 3 — no new rendering logic of its own.
