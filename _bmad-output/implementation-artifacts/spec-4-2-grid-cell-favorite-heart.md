---
title: 'Grid-Cell Favorite Heart (Story 4.2 fast-follow)'
type: 'feature'
created: '2026-09-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'c6a786e699014753d1e581862f9215298628d095'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Favoriting a Fit only works from the Fit detail screen (`app/fit/[id].tsx`, Story 4.2). The My Fits grid (`FitsGridCell.tsx`) has no favorite affordance, so a user browsing the grid has to open a Fit just to favorite it — this was deliberately split out of Story 4.2 as a fast-follow (see `deferred-work.md`).

**Approach:** Add a Depop-style tappable heart badge to the top-right of each `FitsGridCell`, reusing `toggleFitFavorite` and the existing `HeartIcon` component as-is — no new colors, icons, or interaction patterns. Validated against Mobbin: Depop's grid tiles place the favorite heart top-right on the photo itself (no like-count, per this app's rules); Pinterest's save affordance confirms a small semi-transparent circular backing is the established way to keep an icon legible on top of arbitrary photography. `FitsGridCell` gains its own small, self-contained optimistic-toggle (same shape as the detail screen's, minus the shared error banner — see Design Notes).

## Boundaries & Constraints

**Always:** Heart sits top-right over the cover image, small circular backing at `surface-raised`/90% opacity (DESIGN.md's existing overlay-chip token, no new color). Heart is monochrome outline (`ink-secondary`) when inactive, filled (`ink-primary`) when active — fill-vs-outline only, never a color change, no like-count. Tapping toggles immediately, no confirmation. Touch target is ≥44×44pt via `hitSlop`, matching `EXPERIENCE.md`'s rule for a visual element smaller than the minimum target. Tapping the heart must never trigger the cell's own `onPress` (navigation to Fit detail).

**Never:** Don't add a favorite affordance to any other grid (e.g. Wardrobe). Don't touch `FitsFilterChips`, filter logic, or `listFits.ts`. Don't add a screen-level error banner for this — a failed grid-cell toggle reverts locally and reports to Sentry (unless `no_connection`), same "fails open, doesn't block the grid" precedent already used for the Worn-status fetch in `app/(tabs)/fits.tsx`; a single banner slot doesn't fit a multi-cell grid the way it does the one-Fit detail screen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Favorite, currently off | tap heart, `is_favorite=false` | Heart fills solid immediately; `['fits', userId]` invalidated | N/A |
| Favorite, currently on | tap heart, `is_favorite=true` | Heart returns to outline immediately | N/A |
| Favorite write fails, no connection | `toggleFitFavorite` throws `FitError('no_connection')` | Heart reverts to prior state | Not reported to Sentry |
| Favorite write fails, unknown error | `toggleFitFavorite` throws other error | Heart reverts to prior state | Reported to Sentry |
| Second tap mid-write | tap while a toggle is in flight | No-op, no duplicate write | N/A |
| Tap the heart badge | any | Cell's `onPress` (navigate to Fit detail) is not called | N/A |

</frozen-after-approval>

## Code Map

- `components/fits/FitsGridCell.tsx` -- add `fitId: string`, `isFavorite: boolean`, `userId: string | undefined` props. Add an absolutely-positioned top-right `Pressable` (own `useState` override/busy, same shape as `app/fit/[id].tsx`'s `handleToggleFavorite` minus the shared error banner) rendering a small `surface-raised`/90%-opacity circular `View` behind `HeartIcon`. Calls `toggleFitFavorite` (`lib/fits/toggleFavorite.ts`) and `queryClient.invalidateQueries({ queryKey: ['fits', userId] })` on success (same key `app/(tabs)/fits.tsx`/`app/fit/[id].tsx` already invalidate on this table). No reset-on-id-change logic needed here (unlike the detail screen) -- `FlatList`'s `keyExtractor={(item) => item.id}` in `fits.tsx` already gives each cell a stable component instance per Fit, so local override state never needs to survive an identity swap.
- `app/(tabs)/fits.tsx` -- `renderCell` passes `fitId={item.id}`, `isFavorite={item.is_favorite}`, `userId={userId}` to `FitsGridCell`.
- `lib/fits/toggleFavorite.ts`, `components/ui/icons/HeartIcon.tsx`, `lib/fits/errors.ts` -- reused unmodified.
- `__tests__/fitsGridCell.test.tsx` (new) -- unit tests, written first: both toggle directions, both error paths, busy no-op, heart-tap-doesn't-navigate.

## Tasks & Acceptance

**Execution:**
- [x] `__tests__/fitsGridCell.test.tsx` -- test first -- both toggle directions, no-connection + unknown error revert, busy-guard no-op, heart tap doesn't fire `onPress`
- [x] `components/fits/FitsGridCell.tsx` -- add the favorite heart badge per Code Map
- [x] `app/(tabs)/fits.tsx` -- wire `fitId`/`isFavorite`/`userId` into `FitsGridCell`
- [x] `__tests__/fits.test.tsx` -- review fix (verification-gap prerequisite) -- mock `toggleFitFavorite`, wrap renders in `QueryClientProvider`
- [x] `components/fits/FitsGridCell.tsx` -- review fixes -- always `inkPrimary`, name in `accessibilityLabel`, 8px inset, mounted-ref guard, busy dim + `disabled`
- [x] `__tests__/fitsGridCell.test.tsx` -- review fix -- `invalidateQueries` assertion, updated `accessibilityLabel` strings

**Acceptance Criteria:**
- Given the My Fits grid, when I tap a cell's heart badge, then that Fit's `is_favorite` toggles and the heart's fill flips immediately, without opening the Fit.
- Given a Fit is favorited from the grid, when I switch to the Favorites filter, then that Fit appears in it.

## Implementation Notes

- Three review layers (Blind Hunter, Edge Case Hunter, Verification Gap) ran in parallel against the diff at baseline `c6a786e699014753d1e581862f9215298628d095`. Six patch-level findings applied post-implementation: heart color always `ink-primary` (matches `app/fit/[id].tsx` exactly, was drifting to `ink-secondary` for the inactive state); `accessibilityLabel` now includes the Fit's name (was identical across every cell); badge inset bumped from 6px to 8px to match `hitSlop` exactly; a mounted-ref guard added around the post-`await` `setState` calls (un-favoriting under the Favorites filter can unmount the cell mid-write, unlike the detail screen where favoriting never removes the screen from its own view); busy state now dims the icon to `ink-disabled` and sets `disabled` on the badge, matching the identical `low`+`patch` precedent already accepted in Story 4.2's own review for the sibling detail-screen icons; added a `jest.spyOn(queryClient, 'invalidateQueries')` assertion (`newFit.test.tsx`'s established pattern) since no test previously asserted the cache-invalidation the Favorites-filter acceptance criterion actually depends on.

## Spec Change Log

## Review Triage Log

All three review layers (Blind Hunter, Edge Case Hunter, Verification Gap) ran in parallel against the diff at baseline `c6a786e699014753d1e581862f9215298628d095`. Grouped below by root cause.

- **Heart color shifts `ink-secondary` → `ink-primary` between states, contradicting both this spec's own "never a color change" rule and `app/fit/[id].tsx`'s actual shipped behavior (always `inkPrimary`, only `filled` toggles)** (blind-hunter). Verdict: `low` — visually a subtle grayscale shift, not a chromatic hue change, but a direct, verified deviation from an explicit written spec boundary and the sibling implementation. Route: `patch` — always use `inkPrimary`, drop the `inkSecondary` branch.
- **`accessibilityLabel` is identical ("Add to favorites"/"Remove from favorites") across every grid cell, giving no way to tell which Fit a given heart belongs to when navigating a grid of many cells via VoiceOver/TalkBack** (blind-hunter). Verdict: `medium` — real, verified accessibility harm; the outer cell `Pressable` already includes the Fit's `name` in its own label, this one didn't. Route: `patch` — incorporate `name` into the label.
- **Badge sits 6px from the corner inside an `overflow-hidden` ancestor while `hitSlop` extends 8px, so part of the extended hit area could be clipped, undershooting the spec's own ≥44×44pt requirement by a couple of pixels on two sides** (blind-hunter). Verdict: `maybe-false`/`low` if true (RN's hitSlop-vs-ancestor-clipping behavior is platform-dependent and unverifiable without an on-device test) — but the fix is a free, harmless one-class change, so applied regardless rather than left unverified. Route: `patch` — bump the inset to 8px to match `hitSlop` exactly.
- **Un-favoriting a Fit from the grid while the Favorites filter is active triggers a refetch (via `invalidateQueries`) that can filter this exact cell out of the list — unmounting it — before this handler's own `await` chain resumes, risking a `setState` call on an unmounted instance** (edge-case-hunter). Verdict: `low` — in modern React this produces a benign dev-console warning, not a crash or state corruption, but it's a real, reachable scenario unique to this component (unlike the detail screen, where favoriting never removes the screen from its own view) and the fix is a standard, simple mounted-ref guard. Route: `patch`.
- **Busy state (`favoriteBusy`) isn't visually or accessibly surfaced on the badge — no dimming, no `disabled` prop, unlike the detail screen's own Favorite/Wear-today icons** (edge-case-hunter). Verdict: `low` — matches the identical finding already verdicted `low`+`patch` in Story 4.2's own Review Triage Log for the sibling icons ("only dim for `deleting`, not their own busy flag"). Route: `patch` — dim to `inkDisabled` and set `disabled={favoriteBusy}`, same as the precedent.
- **No test asserts the `['fits', userId]` cache-invalidation that this story's own acceptance criterion ("favorite from the grid, then it appears under the Favorites filter") actually depends on** (verification-gap, independently echoed by blind-hunter as a missing integration test for the same root cause). Verdict: filed pre-verified by the verification-gap layer's own evidence rules — confirmed no test in the repo spies on this call, unlike the identical pattern already established in `newFit.test.tsx`. Route: `patch` — added a `jest.spyOn(queryClient, 'invalidateQueries')` assertion matching that precedent.
- **The optimistic override (`favoriteOverride`) is pinned to its reverted value forever after a failed write and never re-derives from a later external refetch (e.g. a focus-triggered refetch bringing genuinely fresher data)** (edge-case-hunter). Verdict: real behavior, but verified identical to `app/fit/[id].tsx`'s own already-shipped catch block (`setFavoriteOverride(!next)`, never reset except by the next tap) — this diff faithfully copied that exact shape per this spec's own Code Map instruction. Route: `defer` — pre-existing pattern, not caused by this story.
- **The inner heart `Pressable`, nested inside the outer cell `Pressable`, may be collapsed into the parent by VoiceOver/TalkBack and become unreachable via assistive tech, even though the RNTL test suite passes (it queries elements directly, not via real touch/accessibility hit-testing)** (blind-hunter). Verdict: `maybe-false` — genuinely uncertain without an on-device VoiceOver/TalkBack check; RN's actual nested-accessible-element behavior is version- and platform-dependent, and I have no simulator/device available in this environment to verify it. If true, this would be `medium`–`high` (the affordance would be unusable for screen-reader users). Route: `defer` — settling this needs a manual on-device accessibility check before shipping to production, not a speculative code change now.
- **`FitsGridCell`'s `userId` prop (`string | undefined`) is used unguarded in `invalidateQueries({ queryKey: ['fits', userId] })`** (blind-hunter, edge-case-hunter — both independently). Verdict: `false` — verified `FitsGridCell` has exactly one caller (`app/(tabs)/fits.tsx`'s `renderCell`), and that screen already returns its loading state (never rendering the grid) while `!userId`, so this component cannot mount with `userId` undefined today. The `string | undefined` type itself is required by TypeScript's lack of closure-narrowing into the nested `renderCell` function, not an oversight.
- **The `waitFor(() => {})` empty-callback pattern used after manually resolving a pending mock promise doesn't assert any specific condition** (blind-hunter). Verdict: `false` — verified this is purely post-assertion cleanup (every real assertion in these tests runs before the `resolveToggle!()` call), matching the identical, already-accepted pattern in `fitDetail.test.tsx:397-398`.
- **`toggleFitFavorite`'s RLS-policy comment isn't re-verified against a second call site** (blind-hunter). Verdict: `false` — `toggleFitFavorite` and the `fits_update_own` policy it relies on are both unmodified by this diff and already proven by the detail screen's own existing call site; RLS policies are evaluated per-row/per-request based on the authenticated user, not per call site, so adding a second caller introduces no new RLS surface.

## Design Notes

Mobbin references: [Depop grid](https://mobbin.com/screens/1598b1b2-31c6-4b6c-9d88-ae3eb255b09c) (heart sits top-right directly on the product photo -- this spec drops its like-count badge, per this app's no-badge-counts rule), [Pinterest masonry feed](https://mobbin.com/screens/ba2603fe-21d5-4612-b5e3-18056f9fc80c) (small semi-transparent circular backing keeps an icon legible over arbitrary photography -- the mechanism this spec borrows, even though Pinterest's own save affordance sits bottom-right).

Nested `Pressable`s: React Native's touch responder system gives the inner (heart) `Pressable` the touch when it's pressed, so the outer cell `Pressable`'s `onPress` does not also fire -- no `stopPropagation` needed, but it's the one behavior in this spec worth a dedicated regression test rather than trusting it silently.

## Verification

**Commands:**
- `npm run test` -- expected: all new/changed tests pass
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

**Manual checks (if no CLI):**
- Run the app (`run` skill): open My Fits, tap a cell's heart badge, confirm it fills/unfills immediately and the Fit appears/disappears under the Favorites filter, without navigating into the Fit.
