---
title: 'Story 5.2 + 4.4: Today on Home and the Wear Streak'
type: 'feature'
created: '2026-09-26'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0ff13225cb2fb9821755e145b102503bd43f9b84'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Home is a "coming soon" placeholder, so a planned Fit never shows up where the user starts their day, and nothing rewards wearing what you own.

**Approach:** Build Home to the approved P4Home mockup (P4Home, P4HomeWorn, P4HomeEmpty, P4HomeDark on https://claude.ai/artifact/PDK6UMqaS7gpozd844FxWj) in the Redesign v2 style: today's planned Fit with one-tap "Mark worn", the wear streak (Story 4.4), and a "This week" strip. No schema change.

**Decisions (user-approved):**
- **Header:** a `caption` long date ("Wednesday, Sep 24"), a `display` "Today", and the existing profile avatar button on the right.
- **Today's Fit** (a live Fit planned for today):
  - A full-width 3:4 tile, `rounded-lg`, filled with the Fit's `canvas_background_color` (`surface-raised` when null) with the cover contained. Tapping it opens Fit detail.
  - Under it: the serif Fit name, then a `caption` meta line: "Planned for today · Worn N×" (or just "Planned for today" at 0), and "Worn N× · including today" once worn today.
  - Buttons: a primary "Mark worn" with a check icon. Once worn it becomes an outlined "Worn today" that undoes the wear on tap. A hairline-outlined "Change" sits beside it and opens today's day sheet on Home, the same sheet as "Plan today's Fit".
- **Nothing planned:** a `surface-tile` card with *Nothing planned for today.* in italic serif, "Pick one of your Fits and it'll be waiting here each morning.", and a primary "Plan today's Fit" button that opens the Planner's day sheet for today on Home.
  - With no Fits at all, the body reads "Save a Fit first, then plan it here." and the button is "Build a Fit", going to `/new-fit`.
- **Wear streak** (Story 4.4), below a hairline: a "Wear streak" `caption` over a serif "N days" ("1 day"), with a secondary note on the right: "In a row, including today" when worn today, or "In a row, through yesterday". The count covers consecutive days with any `fit_wears` row, from today if worn today, otherwise from yesterday. At 0 the row is hidden. Passive only: no notifications or nudge copy.
- **This week:** a "This week" `caption` with a "Planner" text link to the Planner tab, then 7 mini tiles M–S: a planned day is filled like the tile above, with the cover contained; an empty day is a dashed slot. Today gets an ink border and an ink label.
- **States:** skeleton while loading; the error notice with Retry if the plans or Fits read fails; light and dark.
- **Analytics:** `fit_worn` with `source: 'home'` on Mark worn, and `source: 'detail'` from Fit detail's existing Wear today.

## Boundaries & Constraints

**Always:**
- Today's plan comes from the current week's `usePlannedFits` read, joined against the live `useFits` list (a plan for a deleted Fit counts as nothing planned).
- Mark worn / undo reuse `markFitWornToday` / `unmarkFitWornToday`, with the same optimistic override, busy guard and error handling as Fit detail's toggle: the no-connection notice, or the unknown-error notice with Sentry.
- One shared invalidation for every wear write (Home and Fit detail): `wornFitIds`, `todayWornFitIds`, `fitWearsRange` and the new streak key.
- Dates are device-local (`todayLocalDate`, `lib/planner/week.ts`). Home re-reads today on focus and on returning to the foreground, like the Planner.
- The plans, Fits, wear counts, today's wears and streak reads refetch on tab focus. A failed wear-count or streak read fails open (no count, no streak row) and reports to Sentry unless offline.

**Never:**
- No schema change, no month view, no wear photos, no AI suggestions.
- No notifications, reminders or streak nudges. No emoji or flame icons.
- Only today's Fit is interactive; the week strip's tiles are not buttons.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Planned, not worn | today = A, worn 3× before | A's tile, "Planned for today · Worn 3×", "Mark worn" | N/A |
| Mark worn | tap Mark worn | "Worn today" at once; one `fit_wears` row; `fit_worn` source home; streak +1 | N/A |
| Undo | tap Worn today | back to "Mark worn"; row deleted; streak −1 | N/A |
| Mark worn offline | offline | reverts to "Mark worn", no-connection notice | no Sentry |
| Nothing planned | no plan today | Nothing-planned card; "Plan today's Fit" opens today's day sheet | N/A |
| Deleted Fit planned | today = C, C soft-deleted | Nothing-planned card | N/A |
| Streak, not yet today | worn Mon–Tue, today Wed | "2 days · In a row, through yesterday" | N/A |
| Streak broken | last wear Mon, today Wed | streak row hidden | N/A |
| Streak read fails | error | no streak row, rest of Home works | Sentry unless offline |

</frozen-after-approval>

## Code Map

- `app/(tabs)/index.tsx` -- the Home screen, rewritten. Keep the profile avatar button logic (`useProfile`, `useAvatarUrl`, `router.push('/profile')`). Follow `app/(tabs)/planner.tsx` for the header, `renderScreen`, `useFocusEffect`/AppState "today" refresh, the read-error-only-without-data rule, and the tab bar clearance. It becomes scrollable.
- `components/home/TodayFitCard.tsx`, `NothingPlannedCard.tsx`, `WearStreakRow.tsx`, `WeekStrip.tsx`, `HomeSkeleton.tsx` (new). Tile fill and contained cover as in `components/planner/PlannerDayRow.tsx`; covers signed by `useThumbnailUrls`.
- `components/planner/PlanDaySheet.tsx` -- reused as-is on Home for today's day; the Planner screen's write logic (`runWrite`, `pickFit`, `removeFit`) moves to a shared hook `lib/planner/usePlanDayWrites.ts` so Home and Planner share it.
- `lib/fits/markFitWorn.ts` -- add `invalidateWearQueries(queryClient, userId)`; `app/fit/[id].tsx:190-194` switches to it and adds `trackFitWorn('detail')`.
- `lib/fits/wearStreak.ts` (new) -- `getWearDates(userId)` (distinct `worn_on`, `FitError` classification as in `wornFitIds.ts`), `useWearDates` with key `['wearDates', userId]`, and a pure `wearStreak(dates, today)`.
- `lib/analytics/posthog.ts` -- add `trackFitWorn(source: 'home' | 'detail')`.
- Reuse: `useFits`, `usePlannedFits`, `useFitWearCounts`, `useTodayWornFitIds`, `weekStartOf`/`weekDays`, `Text`, `Button`, `ConnectionErrorNotice`, `CheckIcon`.
- Tests: `__tests__/wearStreak.test.ts`, `__tests__/home.test.tsx` (mock hooks as `__tests__/planner.test.tsx` does, including the `todayLocalDate` mock), and extend `__tests__/fitDetail.test.tsx` and `__tests__/planner.test.tsx` for the shared pieces.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/wearStreak.test.ts` -- tests first: streak from today, from yesterday, broken, duplicates on one day, month/DST boundaries; the dates query and error classification.
- [x] `__tests__/home.test.tsx` -- tests first for every matrix row, plus the skeleton, read-error Retry, week strip, header date and focus refetch.
- [x] `lib/fits/wearStreak.ts`, `lib/fits/markFitWorn.ts`, `lib/analytics/posthog.ts`, `lib/planner/usePlanDayWrites.ts`.
- [x] `app/fit/[id].tsx` and `app/(tabs)/planner.tsx` switch to the shared pieces; their existing tests stay green.
- [x] `components/home/*`, then `app/(tabs)/index.tsx`.

**Acceptance Criteria:**
- Given plans, wears and Fits, in light or dark mode, when Home opens, then it matches P4Home / P4HomeWorn / P4HomeEmpty.
- Given a Fit marked worn on Home, when the user opens My Fits' Worn filter, Fit detail or the Planner, then each shows it worn.

## Design Notes

- **Streak rule:** `dates` is the set of distinct `worn_on`. Start at today if it's in the set, else at yesterday; count back while the day is in the set. Uses `addDays`, so DST and month ends are safe.
- **Shared plan writes:** Home's "Plan today's Fit" must behave exactly like the Planner's sheet (upsert, `fit_planned`, busy lock, error notices), so the logic moves into one hook rather than being copied.

## Verification

**Commands:**
- `npm run test` (use `--maxWorkers=2` if suites time out): all suites pass.
- `npm run typecheck`: clean.
- `npm run lint`: no errors.

**Manual checks:**
- On a device, in light and dark mode: plan today in the Planner, see it on Home, mark worn and undo, and watch the streak and the Planner's "Worn" follow; with nothing planned, plan today from Home.

## Review Triage Log

| # | Source | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | blind, edge, verification-gap | Resuming on a new day leaves today's worn set, counts and streak stale; a tap on the stale "Worn today" undoes a wear that doesn't exist | medium | patch | The `AppState` handler only called `setToday`, and `['todayWornFitIds', userId]` has no date in its key. There's no `focusManager` wiring, so nothing refetched. Fixed: resume runs the same refresh as focus. |
| 2 | verification-gap | Nothing tested Home's `AppState` resume path | low | patch | No test in `__tests__/` used `AppState`. Added foreground and background tests to `home.test.tsx`. |
| 3 | verification-gap | Nothing pinned `useTodayWornFitIds`'s cache key, which `invalidateWearQueries` depends on | low | patch | The hook was mocked wherever it rendered. Added a cache-key test to `wornFitIds.test.ts`. |
| 4 | blind, edge (×2) | `getWearDates` is unbounded and unordered, so past PostgREST max-rows the streak can drop recent days | low | patch | Real only above 1000 wear rows. The one-line fix orders by `worn_on desc`, so a cap drops old history rather than the streak's days. |
| 5 | blind | Week-strip day wrappers carry a label without `accessible`, so VoiceOver reads bare letters | low | patch | A labelled `View` isn't one accessibility element on iOS unless `accessible` is set. Added `accessible`. |
| 6 | blind | "Change" gives VoiceOver no context | low | patch | The Pressable had no label. It's now "Change today's Fit"; the visible text is unchanged. |
| 7 | blind | `isOffline` lives in the planner hook, but Home imports it for wear errors | low | patch | Wear code would depend on a planner module. Moved to `lib/fits/errors.ts`. |
| 8 | blind | Home's remove path from the day sheet is untested | low | patch | `onRemove` was wired but unexercised on Home. Added a test. |
| 9 | blind, edge | Home open across midnight writes a wear for the new date while showing the old day | low | reject | It needs the screen to stay foregrounded across midnight with no focus or resume, which isn't everyday use. The fix adds a branch. Fit detail and the Planner share the pattern. |
| 10 | blind | A failed today-worn read shows "Mark worn" on a Fit already worn today, and the duplicate insert still fires `fit_worn` | low | reject | It needs a failed read plus a tap on an already-worn Fit, and only inflates analytics. The fix changes `markFitWornToday`'s return contract. |
| 11 | blind | The first focus refetch cancels and restarts the initial fetches | low | reject | Real, but it's one extra request per query at mount, the same convention as `fits.tsx` and the Planner. The fix adds skip-first logic. |
| 12 | edge | Undo while the today-worn read has failed drops today from the optimistic streak even if another Fit was worn | low | reject | It needs a failed read, then mark, then undo, with another Fit worn today. It's optimistic-only and corrects on refetch. The fix adds a guard. |
| 13 | blind | The skeleton waiting on wear reads contradicts fail-open | false | reject | Fail-open covers errors, which still render Home. Waiting on the today-worn read avoids showing an actionable "Mark worn" on a Fit already worn. |
| 14 | blind | The wear toggle's busy state isn't visible | false | reject | The first tap flips the button at once (optimistic), so the tap visibly registered. Only repeat taps are ignored. |
| 15 | blind, edge | Changing the plan mid-wear records the wear on the old Fit | false | reject | The wear belongs to the Fit the user tapped, so it's correct data. The override is keyed by Fit id, so the new plan shows its own state. The modal sheet also blocks Mark worn during a plan write. |
| 16 | blind | The empty "today" week tile is marked more faintly than a planned one | false | reject | It matches P4Home exactly: a 1px dashed ink border when empty, 1.5px solid ink when planned. |
| 17 | blind | Other missing tests: Retry after an unknown error, the `trackFitWorn` wrapper, the toggle after a failed read, the override across a plan change | false | reject | Retry runs the same handler that the offline Retry test already exercises. The other three cover behaviour rejected above (10, 15) or a one-line capture wrapper, the same as the untested `trackFitPlanned`. |
| 18 | blind | Untracked `supabase/.temp/` isn't gitignored | low | defer | It predates this story (it was in the initial git status). |
