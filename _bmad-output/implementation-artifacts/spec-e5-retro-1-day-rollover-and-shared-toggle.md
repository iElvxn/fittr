---
title: 'Epic 5 retro item 1: Day Rollover and the Shared Worn Toggle'
type: 'bugfix'
created: '2026-09-27'
status: 'done'
baseline_commit: 'c5ac1da81d085cc9b708c9c6edcef733d9c252bf'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Today's worn set is cached with no date in its key, and only Home refetches it when the app resumes. After an overnight resume, the Planner's today sheet and Fit detail show yesterday's wear as "Worn today". Undo then warns that a photo will be deleted and deletes nothing, and Fit detail's Add tile can attach a photo to yesterday's wear. Fit detail also keeps its own copy of the worn toggle, which has drifted from the shared one.

**Approach:**
- Every screen gets "today" from one shared hook. It re-reads the date when the app returns to the foreground and at local midnight.
- Today's worn read is keyed by that date, so a new day is a new query, never yesterday's cache.
- Fit detail moves onto the shared `useWornTodayToggle`.

## Boundaries & Constraints

**Always:**
- Wears are still written for the real local today (`todayLocalDate()` at write time). No backfilling.
- A wear or photo write still invalidates through `invalidateWearQueries`, whose `['todayWornFitIds', userId]` prefix must still match the dated key.
- On Fit detail, the wear toggle, the photo save and Delete (including its photo count) each block the others, as Story 5.5 intended.
- Until today's worn read lands for a new day, no screen offers a Mark worn / undo based on yesterday's data.

**Never:** no schema change, no global `focusManager` wiring, no change to what Home or the Planner refetch on focus, and no visual change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Resume next day, Planner | worn Fit A on day N; resume on N+1 with the Planner open | today's sheet shows "Mark worn" for A, read under N+1's key | N/A |
| Resume next day, Fit detail | Fit detail open on A, worn on day N; resume on N+1 | "Wear today"; no Add tile; the Worn strip's day-N tile reads "Sep 26", not "Today" | N/A |
| Midnight in foreground | app open at 23:59 → 00:00 | every screen's today moves to the new day without a resume | N/A |
| Same day resume | resume on the same day | same key; nothing re-fetched beyond what each screen already does | N/A |
| Fit detail toggle | tap Wear today / Worn today | same behavior as today (optimistic flip, undo confirms if a photo) via the shared hook | failure: notice, back to the server state (Sentry if unknown) |
| Delete counting | Delete's photo count in flight | the wear toggle and Add ignore taps | N/A |
| Undo confirm open | undo-with-photo confirmation showing | a second tap does nothing | N/A |

</frozen-after-approval>

## Code Map

- `lib/fits/useToday.ts` (new): `useToday()` returns `{ today, syncToday }`.
  - `today` starts from `todayLocalDate()`, and `syncToday()` re-reads it.
  - It re-reads on `AppState` `'active'` and on a timer set to the next local midnight (rescheduled every time `today` changes, cleared on unmount).
  - Import `todayLocalDate` from `./localDate`, so tests that mock that module control it. Don't put the hook inside `localDate.ts`: calls within the same module would bypass the mock.
- `lib/fits/wornFitIds.ts:52,70`: change `getTodayWornFitIds(userId, today)` to query `.eq('worn_on', today)`. Change `useTodayWornFitIds(userId, today)` to use the key `['todayWornFitIds', userId, today]`. Update the doc comments.
- `lib/fits/markFitWorn.ts`: keep as is (writes use the real today). `invalidateWearQueries` is unchanged, since the prefix still matches.
- `app/(tabs)/index.tsx:64,87`:
  - Replace `useState(todayLocalDate)` with `useToday()`. `refresh()` calls `syncToday()` instead of `setToday(...)`.
  - Keep Home's own AppState listener for `focusCount` and `refresh`.
  - Pass `today` to `useTodayWornFitIds`.
- `app/(tabs)/planner.tsx:106,155-161,186`:
  - Use `useToday()`, and remove the Planner's AppState listener, since the hook covers it.
  - The focus effect calls `syncToday()`.
  - Pass `today` to `useTodayWornFitIds`.
  - The render-time week/month rollover logic stays as is.
- `app/fit/[id].tsx`:
  - Use `useToday()`, replacing the render-time `todayLocalDate()` (≈441). Pass `today` to `useTodayWornFitIds`.
  - Replace `wornTodayOverride`/`wearBusy`/`handleToggleWornToday` (≈156-240) with `useWornTodayToggle({ userId, fitId: fit?.id ?? null, wear: todayWear ?? null, source: 'detail', blocked: photoActions.busy || deleting || countingPhotos })`.
  - Use its `isWornToday`, `busy`, `isBusy()` and `toggle` wherever `isWornToday`/`wearBusy` are used today (≈353, 445-448, 536-567), and in `handleDeletePress`'s guard.
  - Route `wornToday.error` into the notice (`errorMessage ?? photoActions.error ?? wornToday.error`), and call `wornToday.clearError()` in `clearErrors()`.
- `lib/fits/useWornTodayToggle.ts`: reuse unchanged. It already locks during the undo confirmation, and on failure it falls back to the server's state rather than pinning.
- Tests: `__tests__/wornFitIds.test.ts`, `home.test.tsx`, `planner.test.tsx` and `fitDetail.test.tsx` mock `todayLocalDate` (`mockToday`) and `AppState.addEventListener`. Follow `home.test.tsx:199-215` for resume.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/useToday.test.ts`, `__tests__/wornFitIds.test.ts`, `__tests__/planner.test.tsx`, `__tests__/fitDetail.test.tsx`, `__tests__/home.test.tsx` -- tests first: one or more per matrix row; the hook's resume, midnight timer (fake timers) and cleanup; the dated key and query. Keep existing tests passing, updating only the calls whose signature changed.
- [x] `lib/fits/useToday.ts`, `lib/fits/wornFitIds.ts` -- the shared today hook and the dated read.
- [x] `app/(tabs)/index.tsx`, `app/(tabs)/planner.tsx` -- adopt `useToday` and pass the date.
- [x] `app/fit/[id].tsx` -- `useToday`, the dated read, and the shared toggle.

**Acceptance Criteria:**
- Given any screen and a day change (resume or midnight), when today's worn read for the new day is still loading, then no screen shows yesterday's "Worn today".
- Given `grep -rn "useState(todayLocalDate)" app`, when run, then it finds nothing: every screen's today comes from `useToday`.

## Design Notes

- **Why the date goes in the key:** TanStack Query's rule is that every input a query depends on belongs in its key. With the date in the key, a new day is a cache miss rather than something each screen has to remember to refetch. Home's resume refetch stays, since it also covers plans and counts.
- **Why writes keep `todayLocalDate()`:** the retro proposed passing the screen's date into the writes. Now that every screen follows the real day on resume and at midnight, that would only matter within a sub-second race. It would also let a stale screen write a wear for yesterday, which is backfilling.
- **Known effect:** Home's loading gate includes `todayWornQuery.isLoading`, so once per day change Home shows its skeleton briefly while the new day's read lands.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device: mark a Fit worn, then set the phone's date forward a day (Settings → General → Date & Time) and return to the app on the Planner, then on Fit detail. Neither shows "Worn today". Also check section F of `epic-5-device-checklist.md` (on the `chore/epic-5-retro` branch).

## Review Triage Log

| # | Source | Finding | Verdict | Evidence / route |
|---|---|---|---|---|
| 1 | blind, edge (E1, E8) | Writes use `todayLocalDate()` while reads use the screen's `today`, so a stale screen's undo deletes nothing | low | Real only in the window between the clock changing day and the hook syncing: sub-second in the foreground (midnight timer), and on resume `'active'` syncs before any tap can land. That is the race the Design Notes accept; keeping `todayLocalDate()` is the spec's no-backfill rule. Rejected: unlikely, and the fix adds a guard. |
| 2 | edge (E2) | Undo-with-photo confirmed across midnight unmarks the new day | low | Real but needs the sheet open across 00:00; `unmarkFitWornToday` then deletes nothing (no row yet on the new day) and yesterday's wear stays, which is the no-backfill outcome. Rejected: unlikely; fix adds a guard. |
| 3 | edge (E3) | Optimistic override from an in-flight write shows on the new day | low | Override is cleared when the write settles (`useWornTodayToggle` finally/catch), so it lasts one request across 00:00. Rejected: unlikely; fix adds a key dimension. |
| 4 | edge (E4) | Fit detail's Wear today is enabled while the new day's read loads | false | Not based on yesterday's data (spec rule): it shows the unworn state, and a tap on an already-worn Fit hits the `(user_id, fit_id, worn_on)` unique constraint, which `markFitWornToday` treats as success. Same as the pre-existing first-mount behavior. |
| 5 | blind, edge (E5) | Home's `refresh()` refetches the old day's key on a day-change resume | low | Real: the closure's `todayWornQuery` is still the old key, so one wasted read per day change. The comment is accurate (the refetch serves same-day freshness). Rejected: negligible; skipping it adds a branch. |
| 6 | blind | Duplicate `syncToday` on Home resume (Home's listener and the hook's) | false | Same-date `setState` bails out; no extra render or read. Home's listener is kept on purpose (spec Code Map) for `focusCount` and the refetches. |
| 7 | blind, edge (E7) | New Home test picks only the last AppState listener, order-dependent | low | Real: Home now registers two `change` listeners. Direct correction. **patch**: the test now fires every `change` listener. |
| 8 | blind | Controls look enabled while the undo-with-photo confirmation is open | false | `ActionSheetIOS` is modal: a tap outside it dismisses the sheet (Cancel), so no other control can be pressed while it shows. |
| 9 | blind | Delete not tested on the undo path; lock conditions spread across several expressions | low | The undo path sets the same `wornToday.busy` the tested mark path does. `wearDisabled` omitting `favoriteBusy`/`sharing` matches the old toggle's `disabled`. No named divergence. Rejected. |
| 10 | blind | `handleToggleWornToday` checks `countingRef` while `blocked` gets `countingPhotos` state | low | The two differ only for the render after the count's `finally`, when the Delete sheet is opening. Rejected: unlikely; fix adds complexity. |
| 11 | blind | Unknown toggle error on Fit detail not tested for notice and a single Sentry report | false | Existing tests ("reverts … and reports an unknown error when marking/undoing fails") assert `UNKNOWN_ERROR_MESSAGE` and `Sentry.captureException`. Only the hook reports; the screen no longer calls `reportUnknownError` for wears, so no double report. |
| 12 | blind | Fit detail never re-syncs today on focus | false | The spec gives Fit detail resume + midnight via `useToday`, and focus sync only to Home and Planner. Returning from a pushed screen happens in the foreground, where the midnight timer has already run. |
| 13 | blind | Old-day `todayWornFitIds` entries are never cleaned up and get refetched | false | Unobserved queries are garbage-collected after `gcTime` (5 min default), and `invalidateQueries` refetches only active (observed) queries. |
| 14 | blind, edge (E6) | Time zone or clock changed while the app stays in the foreground leaves the timer wrong | low | Changing either in Settings backgrounds the app, and resume syncs. Only automatic zone changes while the app stays open, which is rare. Rejected: fix adds an event source. |
| 15 | blind | Diff omits the spec; `supabase/.temp/` untracked and not ignored | false | The spec is the claims file, kept out of the diff by design. `supabase/.temp/` predates this change (it's in the session's starting git status) and isn't part of this work. |
