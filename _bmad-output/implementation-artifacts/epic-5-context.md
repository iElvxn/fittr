# Epic 5 Context: Planner

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic adds forward planning to the wardrobe-and-Fit loop. A user can assign saved Fits to days on a weekly calendar, view/replace/remove those assignments, and see today's planned Fit on Home, where they can mark it worn in one tap. It matters because "worn or planned" is a step in the Phase 1 activation funnel, and the planner is the main reason for a user to come back after setting up their wardrobe. That return visit is the core question Phase 1 exists to answer. Done means a user can plan a full week and mark a Fit worn directly from Home.

## Stories

- Story 5.1: Plan Fits for the Week
- Story 5.2: See and Act on Today's Planned Fit from Home

## Requirements & Constraints

- The Planner shows a week strip. Each day cell shows the assigned Fit's cover image, or stays blank when nothing is assigned.
- Tapping any day lets the user pick a Fit to assign, replace the current one, or remove it. Each user can have at most one Fit per day.
- Assignments persist: revisiting a day shows the same Fit.
- Home shows today's planned Fit (cover + name), or a plain prompt linking to the Planner when nothing is planned.
- "Mark worn" on Home records a dated wear entry for today. That entry feeds both the My Fits Worn filter and the wear streak.
- All planner data is private to its owner. Every read and write needs a live network connection: no offline mode, no local queue.
- Analytics: emit `fit_planned` (property `days_ahead`) when a Fit is assigned. Emit `fit_worn` with `source: home` when a Fit is marked worn from Home (Fit detail uses `source: detail`).

## Technical Decisions

- New table `planned_fits`: `id` (client-generated uuid), `user_id`, `fit_id`, `planned_on date`, `created_at`, `updated_at`, `deleted_at`. `planned_on` is unique per user and day.
- RLS uses explicit per-operation policies, never one blanket rule. SELECT/UPDATE/DELETE use `USING (user_id = auth.uid())`. INSERT/UPDATE use `WITH CHECK (user_id = auth.uid())`. RLS ships in the same migration that creates the table.
- Soft deletes via `deleted_at`. Deleting a Fit soft-deletes its `planned_fits` rows. Wear history (`fit_wears`) is kept.
- Marking worn from Home reuses Epic 4's existing `fit_wears` write path (one row per wear, `worn_on` = today). "Worn" and the streak are still derived from that table, not stored flags.
- Day cells and the Home card show the Fit's existing `cover_path` collage. Nothing is re-rendered.
- Reads/writes go straight to Supabase via TanStack Query. No custom backend and no serverless functions. Styling via NativeWind.

## UX & Interaction Patterns

- Planner is a tab-bar destination. Home shows today's Fit first, then quick actions (Add item, Create Fit), with sections separated by `spacing.6` (32px).
- Empty day cell: blank, tap to assign, no copy. Empty Home state: a plain prompt to plan one, linking to the Planner.
- Loading: a skeleton matching the eventual layout, never a bare spinner.
- Writes (assign/replace/remove, mark worn) use block-and-keep on network failure: show "No connection — nothing was lost. Try again." with a retry, and keep the user's input. Background failures show only a small non-blocking indicator, never a modal.
- Removing an assignment isn't listed among the delete actions that need confirmation (item/Fit/account). Any confirmation or action sheet must be the native iOS one, one level deep at most.
- Everything is tap-based: no long-press, no custom swipe actions, no carousel for the week strip, and nothing that competes with the iOS edge-swipe back gesture.
- Visuals are monochrome cream/ink with no accent color. Selected/today/active states use weight or fill-vs-outline only. Photos sit on `surface-tile` with `rounded.lg` and no shadow. Controls use `rounded.sm`. Copy is short with no exclamation marks.
- A "worn today" state follows the Fit-detail convention: a glyph swap within the same Phosphor icon family (calendar → check), not a color change.
- Touch targets are at least 44×44pt (use `hitSlop` where the visual is smaller). Icon-only controls have VoiceOver labels. Layouts must survive the largest Dynamic Type size and SE-class widths. Portrait only.

## Cross-Story Dependencies

- Depends on Epic 3: Fits and their `cover_path` collages must exist to be assigned and displayed.
- Depends on Epic 4: Story 5.2's "mark worn" must use Story 4.2's `fit_wears` write path so the Worn filter (4.1) and streak (4.4) update without extra work.
- Story 5.2 reads the `planned_fits` data that Story 5.1 creates, so 5.1 must land first.
