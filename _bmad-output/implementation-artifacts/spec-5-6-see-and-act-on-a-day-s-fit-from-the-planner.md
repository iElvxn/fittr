---
title: "Story 5.6: See and Act on a Day's Fit from the Planner"
type: 'feature'
created: '2026-09-27'
status: 'done'
route: 'dispatch'
baseline_commit: 'b8e6aec40375b4d23d9cadb88f2b5194f1ff8cd9'
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
  - today, planned Fit: Home's text, "Planned for today · Worn 3×" or "Worn 4× · including today";
  - other days: "Planned" or "Worn" (week-row wording); "Planned" adds " · Worn N×" when N is at least 1, "Worn" never takes a count;
  - worn with nothing planned (today included): plain "Worn".
- Caption: when the header shows, the caption is just `day.long` (the "Worn · {Fit}" caption goes, since the header names the Fit).
- Home's hook is keyed to today's planned Fit, else the Fit worn today, so the card and the sheet act on the same Fit.
- `app/(tabs)/index.tsx` -- use the hook, and pass the same toggle and status to the sheet's header, so the card and the sheet share one state.
- Reuse: `wornOnDay`, `usePlanDayWrites`, `useWearPhotoActions`, `invalidateWearQueries`, `Button`, `ConnectionErrorNotice`.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/planner.test.tsx`, `__tests__/home.test.tsx` -- write the tests first, one or more for every matrix row. Home's existing toggle tests must still pass unchanged.
- [x] `lib/fits/useWornTodayToggle.ts`, `lib/analytics/posthog.ts`, `app/(tabs)/index.tsx` -- extract the toggle, with no change to Home's behaviour.
- [x] `components/planner/DayFitHeader.tsx`, `components/planner/PlanDaySheet.tsx`, `app/(tabs)/planner.tsx` -- the header and its wiring.

**Acceptance Criteria:**
- Given a planned day in light or dark mode, when the sheet opens, then it matches the P5 sheet's type, spacing and controls.
- Given the largest Dynamic Type size on an SE-width screen, when the sheet opens, then the header's buttons wrap rather than clip.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device: mark worn from the Planner, then check Home, the streak and the month tile. Undo with and without a photo. Open View Fit and go back.

## Review Triage Log

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | blind, edge, gap-other | Planner's today toggle reads `todayWornQuery`, which the Planner doesn't wait for; while it loads or fails, an already-worn Fit shows Mark worn and loses its photo section | medium | Home gates render on `todayWornQuery.isLoading` (index.tsx:280); the Planner doesn't. `sheetWorn` goes null whenever `!isWornToday`, and a second insert is swallowed as success (markFitWorn.ts:9), firing `fit_worn` again | patch |
| 2 | blind | Worn-unplanned undo leaves a blank status, then the header vanishes | false | The toggle stays busy through the refetch, so no tap lands; afterwards the day is empty and opens on the grid, as the Empty-day row requires | reject |
| 3 | blind | Merged Sentry effect re-reports a lasting error when another read's error changes | low | planner.tsx effect loops all three errors on any dep change; before, only `wearsError` triggered it | patch |
| 4 | blind, edge | Spec says Home's behaviour is unchanged, but Home now keys to the worn Fit, blocks on plan writes and shows wear errors in the sheet | low | Those changes come from the user's decisions and the shared busy lock; the fix is editing this spec | reject (spec edit) |
| 5 | blind | Spec says in-review while sprint status says in-progress | false | Sprint status syncs at step 5 by design | reject |
| 6 | blind | Mark worn / Worn today don't expose `disabled` to screen readers | low | Same pattern as `TodayFitCard.tsx:121-131`, which the spec says to match; unlikely to matter since they're busy only briefly, and the fix changes both | reject |
| 7 | blind | "Worn with nothing planned" rule is written in two places | low | Both conditions produce the same result on today; no caller diverges today; folding it into the helper adds a parameter | reject |
| 8 | blind | No unit tests for `todayPlannedStatus` / `dayFitStatus` | false | Screen tests cover each wording; a count of 0 is falsy and reads "Planned for today", not "Worn 0×" | reject |
| 9 | blind, gap | The Planner's new reads have no focus-refetch or Sentry tests | medium | Filed by the verification-gap layer: deleting the two `refetch()` lines or reverting the Sentry loop fails no test | patch |
| 10 | blind | Month-view Mark worn and the multi-worn lead Fit are untested | low | Same code path as the week; Home's `fits.find` and `wornOnDay` both walk `fits` in order, so they pick the same Fit | reject |
| 11 | blind | Home and Planner toggles are separate hook instances | false | Both invalidate the shared queries; the spec's "one toggle" is Home's card plus Home's sheet, which do share one | reject |
| 12 | blind | New `'planner'` analytics source isn't documented | false | It's in the spec's Code Map and in the type | reject |
| 13 | blind | Stray blank line; `/^Worn · /` null assertions are now vacuous | low | The vacuous assertions pass without testing anything; they're direct deletions | patch |
| 14 | gap | An undo removing the photo section at once is untested in both sheets | medium | Pre-verified: reverting either `sheetWorn` condition fails no test | patch |
| 15 | gap-other | Home's `closeDaySheet` lacks the `isWearBusy()` guard the Planner has | low | index.tsx:183 checks only `photoActions.busy`; the fix adds one condition | patch |
| 16 | edge | A failed toggle pins the override to its pre-tap value, masking a later wear made on the other tab | low | The catch sets `{worn: !next}`, which stays until the next success for that Fit; the Planner's separate instance now exposes it. `setWornOverride(null)` shows the same pre-tap server state | patch |
| 17 | edge | Home's `openSheet` doesn't clear a stale wear error | low | index.tsx:178 clears only the photo error; the Planner clears both | patch |
| 18 | edge | Two Fits worn today, nothing planned: undoing the lead switches the header to the other worn Fit | false | The day still has a worn Fit, so leading with it is correct | reject |
