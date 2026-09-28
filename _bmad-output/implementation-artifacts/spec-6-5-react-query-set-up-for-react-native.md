---
title: 'Story 6.5: React Query Set Up for React Native'
type: 'refactor'
created: '2026-09-27'
status: 'draft'
route: ''
review_loop_iteration: 0
context: []
depends_on: ['6-3-one-shared-auth-session']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The `QueryClient` runs on web defaults (`app/_layout.tsx:24`).
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
| Tab focus, stale data | refocused after 60s | only that data refetches | failures follow each screen's existing error handling |
| Own write | add an item, save or edit a Fit, plan, wear, photo | every screen showing it updates, fresh or not | N/A |
| Fit save or delete, then Item detail | open an item that is (or was) in that Fit | its Fits strip already reflects the change | N/A |
| Offline read | no connection | "No connection" notice at once, with no retry delay | existing retry button |
| Reconnect | connection returns | active queries refetch | N/A |
| Resume from background | app active again | stale active queries refetch; Home's tile resets as today | N/A |
| Server error | 500 | retried up to twice, then the existing error state | Sentry as today |

</frozen-after-approval>

## Code Map

- `app/_layout.tsx:24` -- `new QueryClient()`. Replace with `createQueryClient()` from a new `lib/query/queryClient.ts`, alongside the one-time `focusManager.setEventListener` (AppState) and `onlineManager.setEventListener` (`expo-network`'s `addNetworkStateListener`, `isConnected`), per TanStack's React Native guide.
- New `lib/query/useRefreshOnFocus.ts` -- `useFocusEffect` that skips the first focus, then calls `queryClient.refetchQueries({ type: 'active', stale: true })`. `'active'` leaves out disabled queries, so the Planner's month reads stay off while the week shows.
- Manual refetch lists to replace: `app/(tabs)/index.tsx:86-118` (keep `syncToday` and `focusCount`; the AppState listener shrinks to `focusCount`), `app/(tabs)/planner.tsx:~170-185` (keep `syncToday`), `app/(tabs)/fits.tsx:118-127`, `app/(tabs)/wardrobe.tsx:93-97`, `app/item/[id].tsx:152-158`.
- Invalidation audit. Current invalidations: `app/fit/[id].tsx`, `app/item/[id].tsx`, `app/new-fit.tsx`, `app/profile.tsx`, `components/fits/FitsGridCell.tsx`, `lib/fits/markFitWorn.ts:82`, `lib/planner/usePlanDayWrites.ts:58`.
  - Add: item add (`['wardrobeItems', userId]` and any category/count keys).
  - Add: Fit save (`app/new-fit.tsx:282-289`) and Fit delete (`app/fit/[id].tsx:242`) also invalidate the `['itemFits']` prefix.
  - Check: item delete also touches Fit reads (Story 3.4's removed items); the plan writes' prefix covers the month keys; wear-photo writes (`useWearPhotoActions`).
- Install: `npx expo install expo-network`.

## Tasks & Acceptance

**Execution:**
- [ ] `__tests__/queryClient.test.ts`, `__tests__/useRefreshOnFocus.test.tsx`, and the screen tests that assert focus refetches (`home`, `planner`, `fits`, `wardrobe`, `itemDetail`) -- retry predicate, first-focus skip, stale-only refetch, the add-item invalidation. The existing "refetches every read on focus" tests change to the stale-only behavior.
- [ ] `lib/query/queryClient.ts`, `lib/query/useRefreshOnFocus.ts`, `app/_layout.tsx`, `package.json` -- client, managers, hook.
- [ ] the five screens -- adopt the hook.
- [ ] `app/add-item.tsx`, `app/new-fit.tsx`, `app/fit/[id].tsx` and any other gap the audit finds -- invalidate on write.

**Acceptance Criteria:**
- Given airplane mode, when any tab loads data, then the no-connection state shows within one request, not after about 7s.
- Given `grep -rn "\.refetch()" app`, when run, then only user-triggered retries (error-state buttons, pull-to-refresh) remain.

## Design Notes

- `app/_layout.tsx` is also changed by Story 6.3 (provider and guards). Build this after 6.3 so the two don't conflict.
- The `subscribed: useIsFocused()` option would also pause unfocused tabs' queries. It isn't used here, to keep hook signatures unchanged. With a 60s `staleTime`, refetching stale queries across the mounted tabs costs little.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: all suites pass.
- `npm run typecheck` / `npm run lint` -- expected: clean.

**Manual checks:**
- On a device with the network inspector: switch tabs quickly (no requests), wait a minute and switch (one round), go into airplane mode (immediate notice), come back online (refetch), add an item and a Fit (both appear at once).
