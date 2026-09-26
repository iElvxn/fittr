# Epic 5 Context: Planner

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic adds forward planning and a record of what was actually worn to the wardrobe-and-Fit loop. A user can assign saved Fits to days on a weekly calendar and view, replace or remove those assignments. They see today's planned Fit on Home and can mark it worn in one tap. A month view lets them look further ahead and back at past wears, and they can attach a real-life photo to a day they wore a Fit. This matters because "worn or planned" is a step in the Phase 1 activation funnel, and the planner is the main reason to come back after setting up a wardrobe. That return visit is the core question Phase 1 exists to answer. Stories 5.3 and 5.4 were added from a user request after the PRD, so they have no PRD requirement of their own and each needs a design mockup before its spec.

## Stories

- Story 5.1: Plan Fits for the Week
- Story 5.2: See and Act on Today's Planned Fit from Home
- Story 5.3: See a Month of Plans at a Glance
- Story 5.4: Attach a Photo of the Outfit Actually Worn

## Requirements & Constraints

- The week strip shows each day's planned Fit cover, or a blank cell when nothing is planned. Tapping a day lets the user assign, replace or remove a Fit. Each user can have at most one Fit per day, and assignments persist.
- Home shows today's planned Fit (cover and name), or a plain prompt linking to the Planner. "Mark worn" there records a wear for today, which feeds both the Worn filter and the wear streak.
- Month view: a calendar grid of the current month with previous/next navigation. Days with a planned Fit show a small indicator, and worn days are distinguished from merely planned ones by weight or fill, never by color. Tapping a day opens the same day sheet with the same rules as the week view.
- Wear photos: taken with the camera or picked from the library, and attached to a specific wear, not to the Fit, so each wear can have its own photo. The photo shows alongside that day in the Planner and can be replaced or removed. Other users must be denied read and write access by both RLS and Storage policies.
- Unlike item photos (where the original is discarded), the wear photo itself is what gets kept. It counts against the free-tier storage budget, which is a launch gate, so compress it on-device before upload.
- All data is private to its owner. Every read and write needs the network: no offline mode, no local queue.
- Analytics: emit `fit_planned` (with `days_ahead`) when a Fit is assigned. Emit `fit_worn` with `source: home` from Home (Fit detail uses `source: detail`).

## Technical Decisions

- `planned_fits` table: `id` (client-generated uuid), `user_id`, `fit_id`, `planned_on date` (unique per user and day), `created_at`, `updated_at`, `deleted_at`. RLS ships in the migration that creates the table.
- RLS uses explicit per-operation policies, never one blanket rule. SELECT/UPDATE/DELETE use `USING (user_id = auth.uid())`, and INSERT/UPDATE use `WITH CHECK (user_id = auth.uid())`.
- Soft deletes via `deleted_at`. Deleting a Fit soft-deletes its `planned_fits` rows, but wear history (`fit_wears`) is kept.
- `fit_wears` (`id`, `user_id`, `fit_id`, `worn_on date`, `created_at`) is the only source of truth for "worn" and the streak. Mark-worn from Home reuses Epic 4's existing write path.
- The month view reads the same `planned_fits` and `fit_wears` data over a month date range. There is no schema change.
- Wear photos: add a nullable photo path column on `fit_wears`, stored in a private per-user Storage folder. The object path must start with `auth.uid()/`, like the `wardrobe` bucket. Access goes through the `ImageStore` interface.
- Day cells and the Home card use the Fit's existing `cover_path` collage. Nothing is re-rendered.
- Reads and writes go directly to Supabase via TanStack Query. No custom backend or serverless functions. Styling uses NativeWind.

## UX & Interaction Patterns

- Planner is a tab-bar destination. On Home, sections are separated by `spacing.6` (32px). An empty day is a blank cell with no copy, and tapping it assigns a Fit.
- Loading uses a skeleton that matches the final layout, never a bare spinner.
- Writes use block-and-keep on network failure: show "No connection — nothing was lost. Try again." with a retry, and keep the user's input. Background failures show only a small non-blocking indicator, never a modal.
- Sheets go one level deep at most, using native iOS confirmation and action sheets.
- Everything is tap-based. No long-press, no custom swipe actions, no carousels, and nothing that competes with the iOS edge-swipe back gesture.
- Visuals are monochrome cream and ink with no accent color. Selected, today, worn and active states use weight, fill-vs-outline or a glyph swap. Worn follows the Fit-detail convention of `CalendarIcon` changing to `CheckIcon` in the same icon family. Photos sit on `surface-tile` with `rounded.lg` and no shadow, and controls use `rounded.sm`. Copy is short with no exclamation marks. The streak shows as a plain "N day streak".
- Touch targets are at least 44×44pt (use `hitSlop` where the visual is smaller), and icon-only controls have VoiceOver labels. Layouts must survive the largest Dynamic Type size and SE-class widths, and the app is portrait only.

## Cross-Story Dependencies

- Needs Fits and their `cover_path` from Epic 3, and the `fit_wears` write path, Worn filter and streak from Epic 4. The streak (Story 4.4) should appear on the new Home alongside Story 5.2.
- Stories 5.2 and 5.3 read the `planned_fits` data that Story 5.1 creates. Story 5.3 reuses 5.1's day sheet.
- Story 5.4 attaches to `fit_wears` rows (Epic 4 / Story 5.2) and shows photos in the Planner day view.
- Account deletion (Story 6.2) must also remove wear-photo files, and the storage-budget check (Epic 6) must account for them.
