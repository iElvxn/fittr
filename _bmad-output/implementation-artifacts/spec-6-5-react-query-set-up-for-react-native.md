---
title: 'Story 6.5: React Query Set Up for React Native'
type: 'refactor'
created: '2026-09-27'
status: 'done'
baseline_commit: 'fe76bb004f6b84a3b0b4fba0b0162a71fac6d2bb'
route: 'dispatch'
review_loop_iteration: 0
context: []
depends_on: ['6-3-one-shared-auth-session']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `QueryClient` runs on web defaults (`app/_layout.tsx:26`).
- It has no `focusManager` or `onlineManager`, so it can't tell when the app returns to the foreground or reconnects.
- `staleTime` is 0.
- Every failure retries 3 times with backoff, even with no connection, so "No connection — try again" appears about 7 seconds late.

To compensate, every tab force-refetches all its reads on every focus (and Home on every resume), whether or not the data could have changed.

**Approach:**
- One `createQueryClient()` with React Native defaults: `staleTime` 60s, `networkMode: 'always'`, and no retries for no-connection errors (up to 2 for others).
- Foreground wired to `focusManager` and connectivity to `onlineManager` (`expo-network`), each registered once.
- Screens replace their manual refetch lists with one `useRefreshOnFocus()` that refetches only stale active queries.
- Every write invalidates the reads it changes, so nothing relies on a focus refetch to show your own changes.

## Boundaries & Constraints

**Always:**
- `networkMode: 'always'`. The default `'online'` pauses queries while offline, which would leave screens with no data, no error and no loading state, and break the app's block-and-keep "No connection" pattern. `onlineManager` is only there so reads refetch when the connection returns.
- `retry: (count, error) => !isOffline(error) && count < 2`, using the shared `isOffline` from `lib/fits/errors.ts`.
- Queries that set their own `staleTime` (the signed-link ones) keep it.
- A write shows up on every screen without relying on focus: every write path invalidates the keys it affects. Known gaps: adding items (`app/add-item.tsx`) invalidates nothing today, and Fit save (`app/new-fit.tsx`) and Fit delete (`app/fit/[id].tsx:242`, which invalidates only `['fits', userId]`) don't invalidate Item detail's `['itemFits', itemId]` (`lib/wardrobe/itemFits.ts:30`). Once Item detail's focus refetch goes, its "In N Fits" strip would stay stale for up to 60s after either, so both invalidate the `['itemFits']` prefix.
- Home keeps `focusCount` (Story 5.7's tile reset) and `useToday`. Only its manual refetch lists go.
- The day rollover still works (Epic 5 retro item 1): today's worn read is keyed by date, so a new day is a cache miss, whatever `staleTime` says.
- Tests keep building their own `QueryClient`; the factory is exported so tests can opt into the real defaults.

**Never:** no persisted query cache (the epic rules out any local cache-of-record), no `useMutation` migration, and no change to query keys or query functions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Tab focus, fresh data | refocused within 60s of the last fetch | no request | N/A |
| Tab focus, stale data | refocused after 60s | only stale data refetches | a failed refetch keeps any data on screen; with none, each screen's existing error state |
| Own write | add an item, save or edit a Fit, plan, wear, photo | every screen showing it updates, fresh or not | N/A |
| Fit save or delete, then Item detail | open an item that is (or was) in that Fit | its Fits strip already reflects the change | N/A |
| Offline read | no connection | "No connection" notice at once, with no retry delay | existing retry button |
| Reconnect | connection returns | stale active queries refetch | N/A |
| Resume from background | app active again | stale active queries refetch; Home's tile resets as today | N/A |
| Server error | 500 | retried up to twice, then the existing error state | Sentry as today |

</frozen-after-approval>

## Code Map

- `app/_layout.tsx:26` -- `const queryClient = new QueryClient()` becomes `createQueryClient()`, plus one module-level `registerQueryManagers()` call next to `initSentry()`. `SessionProvider` stays inside `QueryClientProvider` (6.3's `SIGNED_OUT` clear).
- New `lib/query/queryClient.ts`:
  - `createQueryClient()` -- `staleTime: 60_000`, `networkMode: 'always'`, `refetchOnReconnect: true`, the `retry` predicate from Boundaries (see Design Notes).
  - `registerQueryManagers()` -- kept apart from the factory so tests that call the factory register no listeners.
    - `focusManager.setEventListener` on `AppState` `change`, focused when `status === 'active'`.
    - `onlineManager.setEventListener` on `expo-network`: first `getNetworkStateAsync()` seeds the state, then `addNetworkStateListener` follows it. Online is `state.isConnected !== false`, so an unknown (`null`) state never marks the app offline.
    - Each listener returns its unsubscribe.
- New `lib/query/useRefreshOnFocus.ts`:
  - Imports `useFocusEffect` from `expo-router`, like the screens.
  - Skips the first focus (mount already fetched), then calls `void queryClient.refetchQueries({ type: 'active', stale: true }, { cancelRefetch: false })`.
  - The callback has a block body and returns nothing.
  - `'active'` leaves out disabled queries, so the Planner's month reads stay off while the week shows.
  - `cancelRefetch: false` leaves a refetch already in flight (e.g. a write's invalidation) running.
- New `lib/wardrobe/listItems.ts` export `invalidateWardrobeItems(queryClient, userId)` -- next to `useWardrobeItems`, so the key lives in one file. `invalidateQueries` never rejects on a failed refetch, so callers can fire and forget it.
- Focus blocks to replace with `useRefreshOnFocus()`:
  - `app/(tabs)/index.tsx:80-115`:
    - `refresh()` and its ref go.
    - The focus effect keeps `setFocusCount` and `syncToday()`.
    - The `AppState` listener keeps only the backgrounded → `setFocusCount` tile reset. `useToday` already re-syncs the date on resume (`lib/fits/useToday.ts:30`), and `focusManager` refetches stale reads.
  - `app/(tabs)/planner.tsx:167-187` -- the focus effect keeps `syncToday()`; the refetch list, `isMonthRef` and its effect go.
  - `app/(tabs)/fits.tsx:118-127`, `app/(tabs)/wardrobe.tsx:89-97` -- the focus `refetch()` goes. Their comments about `router.dismissTo` move to the save paths' invalidations.
  - `app/item/[id].tsx:150-159` -- the focus `refetchItemFitIds()` goes.
- Write-path invalidations (new secondary keys are fire-and-forget, so a write never waits on a read a screen away):
  - `app/add-item.tsx:233-263` -- call `invalidateWardrobeItems(queryClient, userId)` before `dismissTo`, not awaited. In the `catch`, pass `'none'` to mark the list stale without fetching: `saveBatch`'s rollback is best-effort, so a failed batch can leave rows behind.
  - `app/new-fit.tsx:~310-317` -- also the `['itemFits']` prefix, not awaited. In the `catch`, invalidate `['fits', userId]`, `['fitItems', fitId]` and `['itemFits']` with `refetchType: 'none'`: `insertFit` can fail after writing part of the Fit, and a fetch here could swap the sheet for "not found".
  - `app/fit/[id].tsx:242` (delete) -- `deleteFit` is a soft delete (`lib/fits/deleteFit.ts:37`): it sets `deleted_at` and clears the Fit's wear-photo columns. Database cascades never run. Plan and wear screens resolve Fit ids against `useFits`, so `['fits', userId]` already drops the Fit. Add `invalidateWearQueries` (`lib/fits/markFitWorn.ts:79`) for the photo columns and the `['itemFits']` prefix. Both fire-and-forget with `.catch(() => {})`, like the existing call.
  - `app/item/[id].tsx` edit and soft delete (the two awaited `['wardrobeItems', userId]` invalidations) -- also the `['fitItems']` prefix, not awaited. Fit detail's item list (key defined inline at `app/fit/[id].tsx:76`) reads each item's name, category, thumbnail and `deleted_at`.
  - Already complete, leave alone: favorite toggles (`fit/[id].tsx:206`, `FitsGridCell.tsx:101`), wear and photo writes (`invalidateWearQueries`), plan writes (`usePlanDayWrites.ts:58`, whose prefix covers month keys), and profile.
  - Out of scope: `app/onboarding.tsx:59` (`updateProfile`) and `lib/auth/providerDisplayName.ts:20`. They write before any screen that reads the profile is mounted.
- User-triggered refetches stay (the only `.refetch()` / `refetch…()` calls left in `app/`):
  - Retry buttons: `index.tsx:324-325`, `planner.tsx:458-460`, `fits.tsx:230`, `wardrobe.tsx:208`, `item/[id].tsx:293`, `fit/[id].tsx:377`.
  - Pull-to-refresh: `fits.tsx:99`, `wardrobe.tsx:298`.
  - Share re-sign: `fit/[id].tsx:269` (`refetchCoverUrl`).
- Wardrobe, Fits, Item detail and Fit detail block on an error only with no data (`isError && !data`), like Home and the Planner.
- Do not change query keys, query functions, or per-query `staleTime` (`thumbnailUrls`, `wearPhoto`, `avatarUrl`).
- Install: `npx expo install expo-network`. It is native, so it needs the same dev-client rebuild as 6.4's `expo-updates`.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/queryClient.test.ts`, `__tests__/useRefreshOnFocus.test.tsx` -- new:
  - The factory's defaults.
  - The retry predicate: offline → no retry; other errors → retried twice. Use `retryDelay: 0` in the test.
  - `registerQueryManagers`, with `expo-network` mocked: the seed and later events drive `onlineManager`, `null` counts as online, and `AppState` drives `focusManager`. Reset both managers after each test (`setFocused(undefined)`, `setOnline(true)`).
  - The hook: skips the first focus, then refetches only stale active queries, without cancelling one in flight.
- [x] `__tests__/listItems.test.ts` -- `invalidateWardrobeItems` invalidates `['wardrobeItems', userId]`. `__tests__/addItemScreen.test.tsx` -- new: the screen refreshes the grid after a save and after a failed batch.
- [x] Screen tests `home`, `planner`, `fits`, `wardrobeGrid`, `itemDetail`:
  - Mock `@/lib/query/useRefreshOnFocus`, so `wardrobeGrid` needs no provider and `useFocusEffect.mock.calls.at(-1)` stays the screen's own effect.
  - The "refetches every read on focus/resume" cases become "calls `useRefreshOnFocus`".
  - Keep the day-rollover, tile-reset and retry cases.
  - Add write-path cases for `newFit` (`['itemFits']`), `fitDetail` delete (wear queries, `['itemFits']`) and `itemDetail` edit and delete (`['fitItems']`).
  - In `rootLayout`, mock `registerQueryManagers` and assert it is called.
- [x] `lib/query/queryClient.ts`, `lib/query/useRefreshOnFocus.ts`, `lib/wardrobe/listItems.ts`, `app/_layout.tsx`, `package.json` -- client, managers, hook, helper, `expo-network`.
- [x] The five screens -- adopt the hook.
- [x] `app/add-item.tsx`, `app/new-fit.tsx`, `app/fit/[id].tsx`, `app/item/[id].tsx` -- invalidate on write.

**Acceptance Criteria:**
- Given airplane mode, when any tab loads data, then the no-connection state shows after one request, not after about 7s.
- Given `grep -rnE "refetch[A-Za-z]*\(\)" app`, when run, then every match is one of the user-triggered sites listed in the Code Map.
- Given the app launched offline, when the connection returns, then the screens showing "No connection" refetch without a tap.

### Review Findings

Second code review, on the patched diff, 2026-11-05. Security review: no findings at confidence 8 or above.

- [x] [Review][Decision] Failed background refresh hides cached data -- `wardrobe.tsx:192`, `fits.tsx:214`, `item/[id].tsx:281` and `fit/[id].tsx:373` block on the error before checking for data, while Home and Planner keep cached data. Resume and reconnect now reach these screens, and an open item edit form is hidden until the read recovers. Fixing it changes what the frozen matrix calls "each screen's existing error handling".
- [x] [Review][Decision] Frozen Reconnect row says "active queries refetch" -- the code refetches stale active queries only, as agreed in Design Notes; the row needs "stale active queries" to match.
- [x] [Review][Patch] Failure-path refreshes fetch immediately [app/new-fit.tsx:335] -- use `refetchType: 'none'` here and on add item's failure path. Today a failed edit can refetch `fits`, flip the sheet to "not found" and lose the retry, a failed offline save can replace a healthy tab with the error block, and a retry can orphan the old cover.
- [x] [Review][Patch] Add-item comment says a failed batch "has already saved some items" [app/add-item.tsx:265] -- `saveBatch` tries to roll them back; say so accurately.
- [x] [Review][Patch] Failed-save test omits `['fitItems', fitId]` [__tests__/newFit.test.tsx:198]
- [x] [Review][Patch] `router.dismissTo` reasoning from `fits.tsx` never moved to Fit save [app/new-fit.tsx:307]
- [x] [Review][Defer] Edit-mode rollback soft-deletes an existing Fit [lib/fits/saveFit.ts:164] -- deferred: pre-existing.
- [x] [Review][Defer] `saveBatch` rollback hard-deletes with no DELETE policy [lib/wardrobe/addItem.ts:153] -- deferred: pre-existing.
- [x] [Review][Defer] Wardrobe's spinner follows every refetch [app/(tabs)/wardrobe.tsx:288] -- deferred: pre-existing, and this story reduces it overall.
- [x] [Review][Defer] Launch-read rejection and `AppState` teardown have no test [__tests__/queryClient.test.ts] -- deferred: safe online default, cheap to add later.

**Rejected:**
- Zero retries on a dropped request while connected: the frozen intent specifies no retries for no-connection errors.
- Fit detail without the hook: not a regression; it had no focus refetch before, and writes invalidate its keys.
- Screen focus tests can hardly fail: hook behaviour is covered with real queries, and the Planner's `enabled` wiring is asserted at `planner.test.tsx:1515` and `:1532`.
- Query keys not centralised, mixed `void` and `.catch` styles: no named harm.
- A pending launch reading after the listener is replaced: only happens in tests or hot reload, and it sets the same manager state.

## Implementation Notes

## Spec Change Log

- 2026-11-03, after review (`bmad-review`: adversarial and edge-case lenses), with the user's approval of the frozen-text changes:
  - Frozen intent: `_layout.tsx:24` → `:26`.
  - Frozen matrix: "only that data refetches" → "only stale data refetches". The hook refetches every stale active query across mounted screens, not just the focused screen's.
  - Non-frozen changes:
    - Fit delete is a soft delete, so the cascade premise was dropped; it now invalidates wear queries and `['itemFits']`, and no longer `['plannedFits']`.
    - `refetchOnReconnect` reverted to the default.
    - `onlineManager` is seeded at launch.
    - The hook passes `cancelRefetch: false`.
    - Test harness: screen tests mock the hook; managers are reset between tests.
    - The add-item invalidation was extracted to `invalidateWardrobeItems` and runs in `finally`.
    - The grep acceptance criterion was narrowed and the user-triggered sites listed in full.
    - The manual checks were replaced.
- 2026-11-05, during implementation:
  - `refetchOnReconnect` changed from "stay on the default" to an explicit `true`. The review's premise was wrong: with `networkMode: 'always'` the default is `false`, so reconnect would have refetched nothing. A real-client test caught it.
  - The grep acceptance criterion was widened to catch bare `refetch()` calls, which the earlier regex missed.
  - `registerQueryManagers` ignores a launch reading that arrives after a newer change (approved in Task 3).
- 2026-11-05, after the second code review, with the user's approval of the frozen-text changes:
  - Frozen matrix: Reconnect now reads "stale active queries refetch"; the stale tab-focus row's error handling now keeps data on screen.
  - Failure-path invalidations use `refetchType: 'none'`; refetching there could lose an edit's retry or replace a healthy tab with the error state.
  - Wardrobe, Fits, Item detail and Fit detail keep cached data when a refresh fails.
- 2026-11-05, after code review:
  - New secondary invalidations are fire-and-forget instead of awaited: an awaited refetch can retry for about 3s, or hold while the app is in the background, after the write has already succeeded.
  - Fit save also invalidates in its `catch`, matching add item's partial-failure handling.
  - `invalidateWardrobeItems` no longer catches, because `invalidateQueries` doesn't reject on a failed refetch.
  - `add-item` gained a screen test after all; it was simpler to reach than the spec assumed.

## Review Triage Log

| # | Layer | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|---|
| 1 | gap, blind | `add-item` invalidation has no screen test | medium | patch | Filed evidence holds; added `addItemScreen.test.tsx` for success and a failed batch |
| 2 | gap | Item edit and delete `['wardrobeItems']` invalidations unasserted | medium | patch | Filed evidence holds; both now required for the grid; assertions added |
| 3 | gap, blind | No-retry rule tested only with `FitError` | medium | patch | Filed evidence holds; raw `TypeError` and Supabase-shaped cases added |
| 4 | gap | Layout never verified to use `createQueryClient` | medium | patch | Filed evidence holds; the mock is now a `jest.fn` asserted once at import |
| 5 | blind | Sequential awaits delay saves on background refetches | low | patch | `invalidateQueries` awaits refetches, which can retry; new keys are now fire-and-forget |
| 6 | edge | Partial Fit save leaves committed changes unrefreshed | medium | patch | `insertFit` writes `fits` before `fit_items` and `deleteOrphanedFitItems` can throw last; the old Fits focus refetch hid this; invalidates in `catch` now |
| 7 | gap, blind, edge | Comment in `index.tsx` names removed `refresh()` | low | patch | Direct rewording |
| 8 | blind | `invalidateWearQueries` docstring omits Fit delete | low | patch | Direct rewording |
| 9 | blind | `new-fit.tsx` comment says "until it next went stale", but staleness triggers nothing | low | patch | Direct rewording |
| 10 | blind, edge | Hook is client-wide; Planner comment reads per-screen | low | patch | Approved in the frozen matrix; hook doc and Planner comment reworded |
| 11 | blind | Helper's `.catch` is dead, and its test only exercises its own mock | low | patch | `queryClient.ts:334` catches unless `throwOnError`; catch and test removed |
| 12 | blind, edge | `isInternetReachable` ignored, so a reconnect can fire too early or never | maybe-false | defer | Needs a device check on how `expo-network` reports captive Wi-Fi and network switches |
| 13 | blind | Focus tests in screens can hardly fail | false | reject | The hook's behaviour, including disabled reads, is covered with real queries in `useRefreshOnFocus.test.tsx`; screens only need to call it |
| 14 | blind | Fit detail doesn't adopt the hook | false | reject | Not a regression: it had no focus refetch before, and writes invalidate its keys |
| 15 | blind | Wardrobe key not centralised at `item/[id].tsx` | low | reject | Pre-existing call sites with no named harm |
| 16 | edge | `getNetworkStateAsync` rejecting leaves the app "online" | low | reject | Unlikely native failure, and the fix adds a branch; focus still refreshes |
| 17 | edge | "Nothing relies on focus" claim fails on partial Fit save | medium | patch | Same root cause as row 6 |

## Design Notes

- `refetchOnReconnect: true` is set explicitly: with `networkMode: 'always'`, query-core defaults it to `false` (`queryClient.ts`, `defaultQueryOptions`). `true` refetches stale active queries. A query that failed counts as stale (query-core marks an error as invalidated), so a read that failed offline refetches on reconnect. `'always'` would also re-sign every image link on each network flap.
- The seed matters: `onlineManager` assumes online at launch, and `expo-network`'s listener reports only changes. Without the seed, an app that starts offline gets one "online" event that changes nothing, so no refetch.
- Errored active queries are stale, so each focus or resume retries them. That matches today's behaviour, minus the fresh reads.
- `focusManager` covers resume: TanStack's default `refetchOnWindowFocus` refetches stale active queries when the app becomes active, which replaces Home's resume refetch list. iOS `'inactive'` counts as unfocused, as in TanStack's React Native guide. Retries pause only until the app is active again.
- The `subscribed: useIsFocused()` option would also pause unfocused tabs' queries. It isn't used, to keep hook signatures unchanged; with a 60s `staleTime`, refetching stale queries across the mounted tabs costs little.
- Fit detail doesn't adopt `useRefreshOnFocus`: it had no focus refetch before, and writes invalidate its keys.
- Known limit: offline with an expired access token, supabase-js tries to refresh the token before the request fails, so the no-connection notice can still lag. This story doesn't change that path.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks** (device, with a network inspector):
- Switch tabs quickly: no requests. Wait a minute and switch: one round of requests.
- Airplane mode: the notice shows at once. Back online: the screen refetches with no tap. Repeat with the app launched offline.
- Add an item: it is on Wardrobe when the sheet closes.
- Save a Fit, then open one of its items: the Fits strip already includes it.
- Rename an item, then open a Fit that contains it: Fit detail shows the new name.
- Delete a worn Fit with a wear photo, then open Home and Planner: the Fit and its photo are gone.
