# Epic 5 Context: Planner

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic adds forward planning and a record of what was actually worn to the wardrobe-and-Fit loop. A user assigns saved Fits to days on a weekly calendar and can view, replace or remove them. They see today's planned Fit on Home and mark it worn in one tap, look further ahead or back in a month view, and attach a real-life photo to a wear. Those photos also appear on the Fit's detail screen. The Planner's day sheet leads with the day's Fit and lets the user mark today worn without going back to Home, and Home's big tile leads with today's wear photo, swiping to the Fit's collage. This matters because "worn or planned" is a step in the Phase 1 activation funnel, and the planner is the main reason to come back after setting up a wardrobe. Phase 1 exists to answer whether users do come back. Stories 5.3 to 5.7 were added from user requests after the PRD, so they have no PRD requirement of their own.

## Stories

- Story 5.1: Plan Fits for the Week
- Story 5.2: See and Act on Today's Planned Fit from Home
- Story 5.3: See a Month of Plans at a Glance
- Story 5.4: Attach a Photo of the Outfit Actually Worn
- Story 5.5: See a Fit's Wear Photos on Fit Detail
- Story 5.6: See and Act on a Day's Fit from the Planner
- Story 5.7: Swipe Between Today's Photo and the Fit on Home

## Requirements & Constraints

- Week strip: each day shows its planned Fit's cover, or a blank cell. Tapping a day lets the user assign, replace or remove a Fit. A user has at most one Fit per day, and assignments persist.
- Home shows today's planned Fit (cover and name), or a plain prompt linking to the Planner. "Mark worn" records a wear for today, which feeds the Worn filter and the wear streak.
- Month view: a calendar grid with previous/next month navigation. Planned days show a small indicator, and worn days are distinguished by weight or fill, never color. Tapping a day opens the same day sheet with the same rules as the week view.
- Wear photos come from the camera or library and attach to a specific wear, not the Fit. They show with that day in the Planner and can be replaced or removed. Other users must be denied read and write by both RLS and Storage policies. The photo itself is kept (unlike item photos) and counts against the free-tier storage budget, which is a launch gate, so compress it on-device before upload.
- Fit detail: a "Worn" strip of that Fit's wear photos, newest first, each dated. Tapping one opens that day in the Planner. When the Fit is worn today and today's wear has no photo, "Add a photo" attaches one to today's wear, as a dashed tile at the start of the strip. The strip is a plain horizontal scroll like Item detail's Fits strip, not a paging carousel (mockup: the P7 row on the design canvas).
- Planner day sheet: a day with a planned Fit leads with that Fit (collage, name, status) and a "View Fit" link to Fit detail. The Fit grid sits below under "Change Fit" and still plans in one tap. An empty day opens straight on the grid.
- Mark worn from the day sheet exists only for today. It behaves exactly like Home, then becomes "Worn today" (tap to undo, confirming first if the wear has a photo), and the photo section appears. Past and future days get no mark-worn, so there is no backfilling. Grid tiles have no second action.
- Home tile paging: when today's wear has a photo, the big 3:4 tile shows the photo first and swipes to the Fit's collage, with two small round page markers beneath (the active one filled). Tapping the photo opens today's day sheet (to replace or remove it); tapping the collage opens Fit detail. With no photo, or today not worn, the tile is the collage alone with no markers. It always opens on the photo. The separate "Today's photo" row under Home's buttons is removed, since the photo now lives in the tile.
- All data is private to its owner. Every read and write needs the network: no offline mode, no local queue.
- Analytics: emit `fit_planned` (with `days_ahead`) when a Fit is assigned, and `fit_worn` with `source: home` from Home (Fit detail uses `source: detail`).

## Technical Decisions

- `planned_fits`: `id`, `user_id`, `fit_id`, `planned_on date` (unique per user and day), timestamps, `deleted_at`. `fit_wears`: `id`, `user_id`, `fit_id`, `worn_on date`, `created_at`, plus a nullable photo path. `fit_wears` is the only source of truth for "worn" and the streak.
- Every table has RLS scoped to `user_id = auth.uid()`, shipped in the same migration that creates the table, with explicit per-operation policies.
- Soft deletes via `deleted_at`. Deleting a Fit soft-deletes its `planned_fits` rows but keeps wear history.
- The month view uses the same data over a month-range query, with no schema change. Stories 5.5, 5.6 and 5.7 need no schema change either. 5.5 reuses Story 5.4's thumbnails, disk cache and signed URLs, plus one small query for the Fit's recent wears with photos. 5.6 reuses Home's mark-worn/undo path and 5.4's photo section.
- Wear photos live in a private Storage folder whose object path starts with `auth.uid()/`, like the wardrobe bucket. All Storage access goes through the `ImageStore` interface.
- Day cells and cards use the Fit's existing `cover_path` collage. Nothing is re-rendered.
- The app talks to Supabase directly via TanStack Query, with no custom backend or serverless functions. Styling uses NativeWind.

## UX & Interaction Patterns

- Planner is a tab-bar destination. An empty day is a blank cell with no copy. Home sections are separated by `spacing.6`.
- Loading uses a skeleton that matches the final layout, never a bare spinner. A write that fails for lack of network uses block-and-keep: show "No connection — nothing was lost. Try again." with a retry and keep the user's input. Background failures show only a small non-blocking indicator.
- Sheets go at most one level deep. Destructive confirmations use native iOS confirmation and action sheets.
- Everything is tap-based. No long-press, custom swipe actions or carousels, and nothing that competes with the iOS edge-swipe back gesture. The one user-approved exception is Story 5.7's Home tile: a plain two-page paging swipe with no labels, overlays or autoplay (mockup: the P6 row on the design canvas).
- Visuals are monochrome cream and ink with no accent color, and state is shown by weight, fill-vs-outline or a glyph swap. Worn uses the `CalendarIcon` to `CheckIcon` swap from Fit detail. Photos sit on `surface-tile` with `rounded.lg` and no shadow. Controls use `rounded.sm`, and sheet tops use `rounded.lg`. Copy is short with no exclamation marks. The streak is a plain "N day streak" with no celebration. Story 5.6 follows the existing day sheet's visual language, with no new mockup.
- Touch targets are at least 44×44pt (use `hitSlop`), and icon-only controls have VoiceOver labels. Layouts must survive the largest Dynamic Type size and SE-class widths, and the app is portrait only.

## Cross-Story Dependencies

- The epic depends on Fits and `cover_path` from Epic 3, and on the `fit_wears` write path, Worn filter, Fit detail and streak from Epic 4. The streak shows on Home alongside Story 5.2.
- Stories 5.2, 5.3 and 5.6 read `planned_fits` from Story 5.1. Stories 5.3 and 5.6 build on 5.1's day sheet.
- Story 5.4 attaches photos to `fit_wears` rows. Stories 5.5 and 5.6 reuse 5.4's photo pipeline and UI, and 5.6 reuses 5.2's mark-worn/undo. The 5.5 strip deep-links into a Planner day.
- Story 5.7 reworks Story 5.2's Home tile and reverses Story 5.4's rule that the tile always keeps the collage. Its photo page opens Story 5.6's day sheet for today.
- Account deletion (Story 6.9) must also remove wear-photo files, and the Epic 6 storage-budget check must account for them.
