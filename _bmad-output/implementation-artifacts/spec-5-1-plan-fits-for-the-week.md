---
title: 'Story 5.1: Plan Fits for the Week'
type: 'feature'
created: '2026-09-26'
status: 'done'
baseline_commit: 'c79909292f1779546de784ffba930feee9729c9c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-fittr-2026-09-09/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Planner tab is a "coming soon" placeholder, so users can't decide ahead of time what to wear.

**Approach:** Build the weekly Planner to the approved P4 mockup (P4Planner, P4PlanSheet, P4PlannerDark/Loading/NoFits on https://claude.ai/artifact/PDK6UMqaS7gpozd844FxWj). It is backed by a new `planned_fits` table with one Fit per user per day, in the Redesign v2 style.

**Decisions (user-approved):**
- **Header:**
  - a `caption` week range ("Sep 22 – 28"; "Sep 29 – Oct 5" when the week crosses months);
  - a `display` "Planner";
  - previous/next week buttons on the right: 44pt, `rounded-sm` hairline outline, chevron icons, labels "Previous week" / "Next week".
  - Weeks start on Monday, and the Planner opens on the current week.
- **Week list:** seven hairline-separated rows, Monday to Sunday. Each row is one button that opens the day sheet.
  - The day `caption` reads "Today" on today. The serif date is `ink-secondary` for past days, and today also gets a small ink dot.
  - A planned day shows a 3:4 tile, about 72×96, `rounded-lg`, filled with the Fit's `canvas_background_color` (`surface-raised` when null) with the cover contained. Next to it are the serif Fit name and a `caption`: "Worn" when a `fit_wears` row exists for that Fit on that date, otherwise "Planned for today" (today) or "Planned".
  - An empty day shows a dashed hairline 72×96 slot with a "+" and "Nothing planned" in `ink-secondary`.
  - A plan whose Fit is deleted counts as an empty day.
- **Day sheet:** a bottom sheet.
  - Its title is the long day ("Thursday, Sep 25") under a `caption` "Choose a Fit", with a close button.
  - A 3-column grid of the user's Fits, in the `useFits` order: 3:4 tiles filled like above, with serif names. The current pick shows an ink check badge.
  - Tapping a Fit assigns it immediately and closes the sheet. When the day has a Fit, a `destructive` text button "Remove from Thursday" clears it.
  - Past days stay editable.
- **States:**
  - Loading: skeleton rows.
  - Failure of the plans or Fits read: the error notice with Retry.
  - No Fits at all: *Nothing to plan yet.* in italic serif, then "Save a Fit first, then give it a day. It'll be waiting on Home that morning.", then a primary "Build a Fit" button that goes to `/new-fit`, with no week list.
  - Light and dark.
- **Analytics:** `fit_planned` with `days_ahead` (negative for past days) on every successful assign or replace.

## Boundaries & Constraints

**Always:**
- **`planned_fits` table** (new migration, which the user applies):
  - `id uuid primary key default gen_random_uuid()`;
  - `user_id` → `auth.users` on delete cascade;
  - `fit_id` → `fits` on delete cascade;
  - `planned_on date`, `created_at`, and an `updated_at` trigger that reuses `public.set_updated_at()`;
  - `unique (user_id, planned_on)`, plus an index on `fit_id`.
- **Security:**
  - RLS is enabled in the same migration, with explicit select/insert/update/delete `_own` policies (`user_id = (select auth.uid())`).
  - Insert and update also check that `fit_id` belongs to a live Fit the caller owns (`exists` on `fits` where the owner is the caller and `deleted_at is null`).
- **Dates:** every date is a device-local `YYYY-MM-DD` (the `todayLocalDate` convention), never a UTC slice.
- **Writes:**
  - Assign/replace is one upsert on `(user_id, planned_on)`, and remove is a hard delete of that day's row.
  - While a write is in flight the sheet stays open and blocks other taps.
  - On failure it stays open and shows the error notice: the no-connection copy, or the unknown-error copy with Sentry.
  - On success, invalidate the plans queries.
- **Refreshing:** the plans, wears and `useFits` reads refetch on tab focus.
- **The wears read** (`fit_wears` in the visible week) fails open: no "Worn" labels, and Sentry unless it's a no-connection error.

**Never:**
- No Home, month view or photo work (Stories 5.2–5.4).
- No change to `fit_wears`, `fits` or Fit detail.
- No long-press, swipe or carousel. The only confirm is the removal itself.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Assign | empty Thu, tap Fit A | Thu row shows A "Planned"; one row upserted; `fit_planned` days_ahead=1 (today Wed) | N/A |
| Replace | Thu = A, tap B | Thu shows B; still one row for Thu | N/A |
| Remove | Thu = A, tap "Remove from Thursday" | Thu empty; row deleted | N/A |
| Worn past day | Mon = A, fit_wears(A, Mon) | Mon caption "Worn" | N/A |
| Deleted Fit | Tue = C, C soft-deleted | Tue shows "Nothing planned" | N/A |
| Write offline | assign while offline | sheet stays open, no-connection notice, plan unchanged | no Sentry |
| Next week | tap Next week | header "Sep 29 – Oct 5", rows for that week's plans | N/A |
| No Fits | useFits → [] | "Nothing to plan yet." + Build a Fit | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/0012_planned_fits.sql` (new): the table, trigger, indexes and RLS as described above. Follow `0008_fit_wears.sql`/`0009` for style and header comments. Policies use the `(select auth.uid())` form.
- `supabase/tests/rls.test.ts`: add a `planned_fits` block in the pattern of the `fit_wears` block (lines ~597-790). Another user can't select, insert, update or delete the first user's rows, and a user can't plan another user's Fit. These tests are skipped when there are no credentials.
- `lib/fits/localDate.ts`: add `toLocalDate(date: Date): string`, and have `todayLocalDate` use it.
- `lib/planner/week.ts` (new): pure helpers for the Monday week start, the seven days of a week (date string, short/long labels, isToday, isPast), the range label, previous/next week, and `daysBetween`.
- `lib/planner/plannedFits.ts` (new):
  - `getPlannedFits(start, end)` returns `{ planned_on, fit_id }[]`, and `usePlannedFits(userId, weekStart)` uses the key `['plannedFits', userId, weekStart]`.
  - `planFit(userId, plannedOn, fitId)` upserts with `onConflict: 'user_id,planned_on'`, and `unplanDay(plannedOn)` deletes.
  - `getWearsBetween(start, end)` returns the set of `${fit_id}|${worn_on}`, with the key `['fitWearsRange', userId, weekStart]`.
  - Classify no-connection errors with `FitError` as `lib/fits/getFitItems.ts` does.
- `lib/analytics/posthog.ts`: add `trackFitPlanned(daysAhead)`.
- `components/planner/PlannerDayRow.tsx`, `PlanDaySheet.tsx`, `PlannerSkeleton.tsx` (new):
  - The sheet uses the same `Modal` pattern as `components/fitBuilder/CanvasBackgroundSheet.tsx` (scrim, handle, `rounded-t-lg`), and its grid scrolls when there are many Fits.
  - Tiles fill and contain the cover the same way `components/fits/FitsGridCell.tsx` and `components/wardrobe/ItemFitsStrip.tsx` do, with covers signed by `useThumbnailUrls`.
  - Reuse `Text`, `Button`, `ConnectionErrorNotice` and the icons in `components/ui/icons` (add a chevron-right if one is missing).
- `app/(tabs)/planner.tsx`: the screen. Follow the header, `renderScreen`, `useFocusEffect` refetch and `useTabBarClearance` patterns from `app/(tabs)/fits.tsx`. The italic serif is `Newsreader_400Regular_Italic`.
- Tests:
  - `__tests__/plannerWeek.test.ts`
  - `__tests__/plannedFits.test.ts`
  - `__tests__/planner.test.tsx`: mock the lib hooks as `__tests__/fits.test.tsx` does.

## Tasks & Acceptance

**Execution:**
- [x] Write the tests first:
  - `__tests__/plannerWeek.test.ts`: Monday start, including when today is a Sunday; the range label, including across months; and the day flags.
  - `__tests__/plannedFits.test.ts`: the query filters, the upsert payload and `onConflict`, the delete filter, the wears set, and error classification.
- [x] `__tests__/planner.test.tsx`: tests first for every matrix row, plus the loading skeleton, the read-error Retry, week navigation, the today marker and the row accessibility labels.
- [x] `supabase/migrations/0012_planned_fits.sql` and the `rls.test.ts` block.
- [x] `lib/fits/localDate.ts`, `lib/planner/week.ts`, `lib/planner/plannedFits.ts`, `lib/analytics/posthog.ts`.
- [x] The `components/planner/*` components, then `app/(tabs)/planner.tsx`.

**Acceptance Criteria:**
- Given Fits and plans, in light or dark mode, when the Planner opens, then it matches P4Planner, and the day sheet matches P4PlanSheet.
- Given a plan saved on one device, when the Planner regains focus, then it shows the saved Fit.
- Given the migration applied, when another user queries, inserts, updates or deletes `planned_fits`, then RLS denies it (per the `rls.test.ts` block).

## Design Notes

**Differences from `epic-5-context.md`:**
- **No `deleted_at`:** `planned_fits` gets no `deleted_at` column. A plan is a lightweight pointer like a `fit_wears` row: removing one is a hard delete, and a plan for a soft-deleted Fit reads as empty (joined against the live `useFits` list), so there's nothing to soft-delete. It also avoids needing a partial unique index for `(user_id, planned_on)`.
- **Server-generated `id`:** `id` comes from the server default, not the client, so the upsert on conflict never rewrites the primary key.
- **Copy on empty days:** the approved mockup's "Nothing planned" replaces the context's "no copy" rule for empty days.

## Verification

**Commands:**
- `npm run test` (use `--maxWorkers=2` if the builder suites time out): all suites pass.
- `npm run typecheck`: clean.
- `npm run lint`: clean.

**Manual checks:**
- Apply `0012` to Supabase. Then on a device, in light and dark mode:
  - plan, replace and remove a day;
  - go to the next and previous week;
  - mark a Fit worn from Fit detail and see "Worn" on today's row;
  - delete a planned Fit and see its day empty.

## Review Triage Log

Review 1 (blind-hunter, edge-case-hunter, verification-gap), 2026-09-26.

| # | Source | Finding | Verdict | Evidence | Route |
|---|---|---|---|---|---|
| 1 | edge-case | A failed focus/post-write refetch with cached data replaces the loaded week with the error screen | medium | React Query v5 sets `status: 'error'` while keeping `data` (`query.js` error reducer); `readError` only checked `isError` | patch: error screen only when no data; Sentry still reports; test added |
| 2 | blind + edge-case | Week and "today" don't roll over when the mounted tab or backgrounded app reaches a new day or week | medium | `today` read per render and `weekStart` fixed at mount; nothing re-renders on resume | patch: `today` state refreshed on focus and AppState `active`; follows into the new week only if the user was on the current week; 2 tests |
| 3 | verification-gap | No test that "Worn" beats "Planned for today" on today's row | low | pre-verified | patch: test added |
| 4 | verification-gap + blind | No test that re-tapping the current pick closes without writing or tracking | low | pre-verified | patch: test added |
| 5 | blind | Untested: Remove hidden for a deleted-Fit plan; scrim ignored while busy | low | no covering tests | patch: test added; scrim press added to the in-flight test |
| 6 | blind | RLS suite misses cross-user upsert, repoint to own soft-deleted Fit, owner's positive select | low | no covering cases | patch: 2 cases + owner read-back added |
| 7 | blind + edge-case | Focus refetch runs with no user (refetch ignores `enabled`) | false | `(tabs)/_layout.tsx` redirects when there's no session, so the screen never renders without `userId` | reject |
| 8 | blind + edge-case | Slow wears read holds the whole week on the skeleton | low | reads run in parallel, so the extra wait is marginal; dropping the gate would flash "Planned for today" → "Worn"; matches `fits.tsx`, which also waits | reject |
| 9 | blind | No "back to this week" control | low | not in approved intent/mockup; adds UI | reject |
| 10 | blind | Range label has no year | low | only matters paging across years; adds a branch | reject |
| 11 | blind | `unplanDay` deletes by date with no `user_id` filter | false | the app client is always RLS-scoped (`planned_fits_delete_own`); no elevated caller exists | reject |
| 12 | blind | Retry gives no in-progress feedback | low | same as existing `fits.tsx` pattern; needs added state | reject |
| 13 | blind | Remove/Close/scrim don't expose disabled to accessibility | false | RN `Pressable` merges `disabled` into `accessibilityState` itself | reject |
| 14 | blind | Sheet tile width hardcodes the 16px gutter; huge on tablets | low | `px-gutter` is 16px, same constant pattern as `fits.tsx`; app is portrait phone-only | reject |
| 15 | blind | No composite FK for Fit ownership; mixed `if not exists` idempotency | low | spec puts ownership in the insert/update policies; only service role bypasses them; migration style matches `0008` | reject |
| 16 | blind | Plans for soft-deleted Fits are never cleaned up | false | intended per Design Notes (a plan reads as empty); Home's read is Story 5.2's | reject |
| 17 | blind | RLS `afterAll` ignores cleanup errors | low | same as existing blocks; test-fixture only | reject |
| 18 | edge-case | Picking a Fit soft-deleted on another device reports to Sentry as unknown | low | rare cross-device race; fix adds an error-code branch | reject |
| 19 | edge-case | `trackFitPlanned` throwing after a saved write leaves the sheet open | false | `posthog.capture` doesn't throw; no path shown | reject |
| 20 | verification-gap (other) | Fit detail doesn't invalidate `fitWearsRange` | false | Fit detail is pushed over the tabs; returning to the Planner fires its focus refetch | reject |
