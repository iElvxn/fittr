---
title: "Story 5.6: See and Act on a Day's Fit from the Planner"
type: 'feature'
created: '2026-09-27'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Planner's day sheet always opens on "Choose a Fit". The day's current Fit is only a small check in the grid, which may be scrolled out of view, and today's Fit can only be marked worn from Home or Fit detail.

**Approach:** When a day has a planned Fit, the sheet leads with it: its collage, name and status, a "View Fit" link to Fit detail and, on today only, the same Mark worn / Worn today toggle as Home. The grid moves below under "Change Fit" and still plans in one tap.

**Decisions (user-approved):**
- **Mark worn exists only on today.** Past and future days never get it, so there's no backfilling.
- **The toggle behaves exactly like Home's:** one tap, optimistic, and undo asks first when the wear has a photo. Once worn, the Story 5.4 photo section appears in the same sheet.
- **Grid tiles keep one action:** tapping one plans it. There's no second action and no long press.
- **Empty days are unchanged:** the sheet opens straight on the grid.
- **A day worn with nothing planned leads with the worn Fit,** as its month tile does. Its status reads "Worn", it has View Fit and, if it's today, Worn today. Nothing is checked in the grid, there's no Remove, and the grid keeps its "Choose a Fit" label.
- **When the 5.4 photo section shows, the header drops its collage.** It keeps the name, status and buttons, and the approved P5 photo-plus-collage pair stays as it is.
- **Home's "Change today's Fit" sheet shows the same full header,** Mark worn included. Home's card and the sheet share one toggle, so they always agree.
- **No new board:** the header follows the P5 sheet's visual language.

## Boundaries & Constraints

**Always:**
- Wear writes go through `markFitWornToday` / `unmarkFitWornToday` and `invalidateWearQueries`, so the week rows, month tiles, Home, streak and Worn filter all update.
- One shared busy lock covers the sheet: a plan write, a wear toggle and a photo write each block the others.
- Errors use the no-connection or unknown-error notice inside the sheet. Unknown errors are reported to Sentry.

**Never:** no schema change, no second action on grid tiles, no marking of past or future days, and no editing a Fit from the sheet.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Planned day | open a day with a planned Fit | header with collage, name, status and View Fit; grid under "Change Fit" with the Fit checked | N/A |
| Mark worn today | tap Mark worn | flips to "Worn today" at once; wear written; `fit_worn` with source `planner`; photo slot appears | revert and notice (Sentry if unknown) |
| Undo today | tap Worn today, no photo | back to Mark worn in one tap | revert and notice |
| Undo with photo | tap Worn today, wear has a photo | native confirm first; Cancel keeps both the wear and the photo | N/A |
| Not today | a past or future day with a plan | header without Mark worn | N/A |
| Worn, nothing planned | a day whose only Fit is a wear | header leads with the worn Fit, status "Worn"; nothing checked; no Remove; "Choose a Fit" label | N/A |
| Worn day | the header and the 5.4 photo section both show | header has no collage | N/A |
| Home sheet | "Change today's Fit" | same header; its toggle and the card's always agree | N/A |
| Empty day | a day with no plan and no wear | opens on the grid, as now | N/A |
| View Fit | tap View Fit | sheet closes, Fit detail opens | ignored while busy |
| Busy | a write in flight | every control in the sheet ignores taps | N/A |

</frozen-after-approval>

## Code Map

- `components/planner/PlanDaySheet.tsx` -- add the header above the photo section; the day's Fit is the planned one, else the worn one (`wornOnDay`). The caption stays `day.long`. The grid label becomes "Change Fit" only when a planned Fit leads. The existing `worn` / photo props and the `busy` lock are reused.
- `components/planner/DayFitHeader.tsx` (new):
  - The 3:4 collage (same fill as the grid tiles), serif name and status caption.
  - `View Fit` as an outlined `rounded-sm` control.
  - On today, Mark worn (primary, `CheckIcon`) or Worn today (outlined, accessibility label "Worn today. Tap to undo"), as in `TodayFitCard`.
- `lib/fits/useWornTodayToggle.ts` (new) -- lift Home's optimistic toggle out of `app/(tabs)/index.tsx` (`wornOverride`, `wearBusyRef`, `toggleWornToday`, the confirm via `confirmUndoWearWithPhoto`) and take the analytics source as a parameter. Home keeps its derived count and streak on top of the hook's `override`.
- `lib/analytics/posthog.ts` -- `trackFitWorn` accepts `'planner'`.
- `app/(tabs)/planner.tsx` -- read `useFitWearCounts` and `useTodayWornFitIds`, build the status, wire the hook, and have View Fit close the sheet and then `router.push('/fit/{id}')`. The status reads:
  - today: Home's text, "Planned for today · Worn 3×" or "Worn 4× · including today";
  - other days: "Planned" or "Worn" (week-row wording), plus " · Worn N×" when N is at least 1.
- `app/(tabs)/index.tsx` -- use the hook, and pass the same toggle and status to the sheet's header, so the card and the sheet share one state.
- Reuse: `wornOnDay`, `usePlanDayWrites`, `useWearPhotoActions`, `invalidateWearQueries`, `Button`, `ConnectionErrorNotice`.

## Tasks & Acceptance

**Execution:**
- [ ] `__tests__/planner.test.tsx`, `__tests__/home.test.tsx` -- write the tests first, one or more for every matrix row. Home's existing toggle tests must still pass unchanged.
- [ ] `lib/fits/useWornTodayToggle.ts`, `lib/analytics/posthog.ts`, `app/(tabs)/index.tsx` -- extract the toggle, with no change to Home's behaviour.
- [ ] `components/planner/DayFitHeader.tsx`, `components/planner/PlanDaySheet.tsx`, `app/(tabs)/planner.tsx` -- the header and its wiring.

**Acceptance Criteria:**
- Given a planned day in light or dark mode, when the sheet opens, then it matches the P5 sheet's type, spacing and controls.
- Given the largest Dynamic Type size on an SE-width screen, when the sheet opens, then the header's buttons wrap rather than clip.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device: mark worn from the Planner, then check Home, the streak and the month tile. Undo with and without a photo. Open View Fit and go back.
