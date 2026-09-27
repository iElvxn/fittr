---
title: 'Story 5.3: See a Month of Plans at a Glance'
type: 'feature'
created: '2026-09-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'bfa0cd3ec37eb5a19281c3c5812d70c2d88a2396'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Planner shows one week at a time, so a user can't see further ahead or look back at what they wore.

**Approach:** Add a month view to the Planner, built to the approved P4Month / P4MonthDark / P4MonthLoading boards (Phase 4b on https://claude.ai/artifact/PDK6UMqaS7gpozd844FxWj). No schema change.

**Decisions (user-approved):**
- **Switcher:** "Week" and "Month" chips under the Planner title, in the existing filter-chip style. The header caption and arrows follow the mode: "Sep 22 – 28" pages weeks; "September 2026" pages months ("Previous month" / "Next month").
- **Grid:** Monday-first, with single-letter weekday headers and 7 columns. Each day shows its serif date. Days outside the month are blank and past dates are muted. Every day keeps the same 3:4 slot, so empty weeks don't collapse, and an empty day shows a dashed outline there, like the week view's empty row (ink when it's today). *(Renegotiated 2026-09-26 after a Mobbin review: the approved "date only" empty day let empty weeks collapse.)*
- **Day tile:** a planned or worn day shows a mini 3:4 tile of the Fit, filled like the week view (canvas color, or `surface-raised`; cover contained). A worn day adds an ink check badge on the tile. Under the grid, a "Worn" key shows the badge.
- **Today:** an ink-filled date with inverse text, and an ink border on its tile.
- **Worn without a plan:** a day with a `fit_wears` row but no plan shows the worn Fit's tile with the badge. When a day has both, the planned Fit shows, with the badge if it was worn.
- **Switching keeps your place:** Month opens on the month of the visible week's Monday. Going back to Week lands on today's week if that month contains today, otherwise on the month's first week.
- **Remembered view:** the Planner opens on whichever view was last used, stored on the device. It falls back to Week when nothing is stored or the read fails. Home's "Planner" link lands on that view. On launch, Month opens on today's month.
- **Tap:** every in-month day opens the week view's day sheet for that date (assign, replace, remove, same rules).
- **States:** a month-shaped skeleton while loading; the read-error notice with Retry; the existing "Nothing to plan yet." screen with no Fits; light and dark.

## Boundaries & Constraints

**Always:**
- Month plans and wears come from the existing `planned_fits` / `fit_wears` reads over the month's first-to-last date, joined against the live `useFits` list (a deleted Fit's plan or wear reads as nothing).
- Day-sheet writes go through `usePlanDayWrites`; every wear read stays covered by `invalidateWearQueries` and every plan read by the `['plannedFits', userId]` prefix.
- Dates are device-local and built through `lib/planner/week.ts` helpers. When the day rolls into a new month while the user is on the current month, the view follows it (same rule as the week).
- A failed wears read fails open: no badges and no worn-only tiles, reported to Sentry unless offline.

**Never:**
- No schema change, no wear photos, and no change to the week view's rows (it stays plan-only).
- No color for state; no long-press or swipe paging.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Switch to month | tap Month | grid for the month; caption "September 2026" | N/A |
| Page months | tap Next month on Sep 2026 | October 2026 grid, reads its range | N/A |
| Planned, worn | plan A on the 11th, A worn on the 11th | A's tile with the badge | N/A |
| Worn without plan | no plan on the 16th, B worn | B's tile with the badge | N/A |
| Planned, not worn | plan C on the 29th | C's tile, no badge | N/A |
| Deleted Fit | plan on a soft-deleted Fit | date only | N/A |
| Tap a day | tap the 29th | day sheet "Tuesday, Sep 29", C selected | write errors as in the week view |
| Wears read fails | error | plans show, no badges | Sentry unless offline |
| Switch back to Week | on October 2026, today Sep 26 | week of Sep 28 – Oct 4 (October's first week) | N/A |
| Remembered view | last used Month, app relaunched | opens on Month, today's month | stored read fails: Week, no Sentry |

</frozen-after-approval>

## Code Map

- `lib/planner/week.ts` -- add pure month helpers: `monthStartOf(date)`, `shiftMonth(monthStart, n)`, `monthLabel(monthStart)` ("September 2026"), and `monthGrid(monthStart, today)`, which returns Monday-first weeks of `WeekDay | null` (null outside the month). Also `dayOf(date, today): WeekDay`, so `PlanDaySheet` gets a day for any date; `weekDays` should reuse it. Keep the existing exports unchanged.
- `lib/planner/plannedFits.ts` -- add `usePlannedMonth(userId, monthStart)` with key `['plannedFits', userId, 'month', monthStart]`, and `useMonthWears(userId, monthStart)` with key `['fitWearsRange', userId, 'month', monthStart]`. Both reuse `getPlannedFits` / `getWearsBetween` over the month range. The `'month'` segment keeps a month whose first day is a Monday from sharing a week's cache entry.
- `lib/planner/viewPreference.ts` (new) -- `loadPlannerView()` / `savePlannerView(view)` over `@react-native-async-storage/async-storage` (already a dependency, used by `lib/supabase.ts`) under one key. A non-sensitive UI preference, so plain AsyncStorage is fine. A missing value, unknown value or read error returns `'week'`; a write error is ignored. The Planner shows its skeleton until the load resolves, so Week never flashes before Month.
- `components/planner/PlannerViewChips.tsx` (new) -- Week/Month chips; copy `components/fits/FitsFilterChips.tsx`'s markup and states (`accessibilityState.selected`).
- `components/planner/PlannerMonthGrid.tsx` and `PlannerMonthSkeleton.tsx` (new) -- the grid, cells and "Worn" key. Tile fill and contained cover as in `PlannerDayRow.tsx`; badge like `PlanDaySheet`'s check badge. Each cell is one button labelled e.g. "Tuesday, Sep 29: Airport, planned" / "…, worn" / "…: nothing planned" (with ", today" after the date for today).
- `app/(tabs)/planner.tsx` -- add `view` state (default Week), `monthStart` state with the rollover rule, mode-aware caption, arrows and labels, and the month queries (enabled only in month view, refetched on focus alongside the week reads). Also build the month's day → Fit map (plan first, else a live worn Fit, first in `useFits` order), and route the sheet's day through `dayOf`. Keep the week list, skeleton and states unchanged.
- Tests: extend `__tests__/plannerWeek.test.ts` (month math: leading blanks, 28–31 days, year end, DST), `__tests__/plannedFits.test.ts` (month keys and ranges) and `__tests__/planner.test.tsx` (every matrix row, rollover, skeleton, error, a11y labels).

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/plannerWeek.test.ts`, `__tests__/plannedFits.test.ts`, `__tests__/viewPreference.test.ts` -- tests first for the month helpers, hooks and the stored view.
- [x] `__tests__/planner.test.tsx` -- tests first for every matrix row plus the switcher, rollover, skeleton, read error and labels.
- [x] `lib/planner/week.ts`, `lib/planner/plannedFits.ts`, `lib/planner/viewPreference.ts` -- the month helpers, hooks and stored view.
- [x] `components/planner/PlannerViewChips.tsx`, `PlannerMonthGrid.tsx`, `PlannerMonthSkeleton.tsx`, then `app/(tabs)/planner.tsx`.

**Acceptance Criteria:**
- Given plans and wears, in light or dark mode, when the month view opens, then it matches P4Month / P4MonthDark, and P4MonthLoading while loading.
- Given a plan made or removed from the month's day sheet, when the user switches to Week or opens Home, then both reflect it.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | verification-gap, blind | Nothing tested that the month isn't refetched on focus while the week is showing | low | patch | Removing the `isMonthRef` guard broke no test. Added a week-view focus test. |
| 2 | verification-gap | Nothing tested that the month skeleton waits for the month wears | low | patch | Only the month-plans loading case was tested. Added a month-wears loading test. |
| 3 | blind | The month skeleton is always 5 weeks, so 4- and 6-week months jump in height | low | patch | `WEEKS = 5` was hard-coded. It now takes `weeks.length`, with a 6-week August test. |
| 4 | blind | The chip container is a `tablist` but holds `button`s | low | patch | Mismatched roles for VoiceOver. Dropped the `tablist` role, so these are plain toggle buttons with `selected`. |
| 5 | edge | Retry re-reads the plans but not the wears, so badges stay missing after Retry | low | patch | Retry only called the plans' `refetch`. It now also refetches the active wears, in both views, and the test asserts it. |
| 6 | blind, edge | A stored Month shows the week skeleton, then the month skeleton | low | reject | The spec asks for "its skeleton" until the stored view loads. The swap lasts only as long as a local AsyncStorage read, and no Week content ever shows. |
| 7 | blind, edge (×2) | Toggling views re-sends an already-reported read error to Sentry | low | reject | It only happens while a read stays failed and the user toggles views. The fix adds dedupe state. |
| 8 | blind | Paging to an uncached month flashes the skeleton | low | reject | Same as the shipped week paging (no `keepPreviousData` there either), so both views stay consistent. |
| 9 | blind | Week reads keep running while Month shows | low | reject | It's two small reads per focus. Gating them changes `usePlannedFits`, which Home shares. |
| 10 | blind | "Remove from Tuesday" doesn't name the date in month view | low | reject | The sheet title right above reads "Tuesday, Sep 29". Changing it alters the approved week copy, or adds a prop. |
| 11 | blind | The worn-Fit lookup scans the Fits list for each day | low | reject | That's at most 31 small scans, so negligible. |
| 12 | blind | A day where a different Fit was worn than planned shows only the planned Fit | false | reject | That's the approved frozen decision: "When a day has both, the planned Fit shows, with the badge if it was worn." |
| 13 | blind | Font scale is read once per render | false | reject | It's the app-wide convention (`Text`, `PlannerDayRow`) and not new here. |
| 14 | edge | A hung AsyncStorage read leaves the skeleton forever | low | reject | It needs the native module to never settle, and the fix adds a timeout race. |
| 15 | edge | Focus refetch could run with no user | false | reject | `(tabs)/_layout.tsx` redirects to Welcome when there's no session, so the Planner never mounts without a user. |
| 16 | blind | The spec and sprint-status files aren't in the diff | false | reject | Deliberate: the diff covers code, and the spec is the claims file. |

## Design Notes

- **Month range:** each read covers `monthStart` to its last day; the grid only renders in-month days, so leading and trailing blanks need no data.
- **Which Fit a day shows:** `planByDate.get(date) ?? firstLiveWornFit(date)`, badged when `wears.has(`${fit.id}|${date}`)`. It's a pure step, so test it through the screen.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: no errors.

**Manual checks:**
- On a device, in light and dark mode: switch to Month and page a few months; plan, replace and remove a day from the grid; mark worn on Home and see the badge; check the largest Dynamic Type size on an SE-width screen.
