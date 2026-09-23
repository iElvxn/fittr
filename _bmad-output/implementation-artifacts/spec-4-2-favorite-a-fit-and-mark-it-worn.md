---
title: 'Story 4.2: Favorite a Fit and Mark It Worn'
type: 'feature'
created: '2026-09-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '8e2a4895a8eb059e297a1f1d3be752c509ff133b'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Fit detail screen's action row (`app/fit/[id].tsx`) only has Edit/Delete, so a user can never favorite a Fit or log wearing it — the Favorites/Worn filters built in Story 4.1 have no way to ever populate, and Epic 4's wear-streak (Story 4.4) has no data to count.

**Approach:** Add Favorite and Wear-today icon buttons to the existing detail-screen action row — a heart toggling `fits.is_favorite`, a calendar icon inserting/removing today's `fit_wears` row — each backed by a small, directly-testable lib function, reusing existing RLS policies plus one new narrowly-scoped policy for undo. Write unit tests first for every changed file. Visual treatment follows DESIGN.md's existing outline-to-filled heart spec and Story 4.1's Mobbin references (Whering, Doji, Zalando) — no new colors, fonts, or UI patterns invented. A Depop-style favorite heart on the My Fits grid cell itself is a deliberate fast-follow, not part of this spec (see `deferred-work.md`) — this story's own token budget pushed past 1600 once that surface was added, and the two are cleanly separable: this spec's diff is reviewable/testable on its own.

**Decision — Wear-today undo (resolved 2026-09-22, delegated to implementer judgment on request):** Add a scoped `fit_wears_delete_own` RLS policy (`user_id = auth.uid()`, mirrors every other `_own` policy in this schema) so a same-day mis-tap is recoverable — standard practice for a loggable action, and secure since RLS still confines it to the caller's own rows. The client UI only ever exposes unmarking *today's* entry (never a past date), so wear history stays trustworthy for Story 4.4's streak even though the policy itself doesn't distinguish dates. This closes the deferred item from Story 4.1's review.

## Boundaries & Constraints

**Always:** Favorite toggle has no confirmation step and updates immediately (EXPERIENCE.md: distinct from destructive actions). Wear-today always writes *today's* device-local calendar date; unmarking (second tap) only ever targets today's row. New icon buttons join the existing action row using the exact same icon family/size/`hitSlop`/disabled-while-busy convention as Edit/Delete (`ACTION_ICON_SIZE`, `ACTION_TOUCH_TARGET`, `active:opacity-60`). The new heart icon matches `PencilIcon`/`TrashIcon`'s thin-stroke family (`strokeWidth={1.75}`). All colors come from existing `ink-primary`/`ink-secondary` tokens — filled heart is a solid fill, never a color change.

**Never:** Don't implement streak calculation (Story 4.4 owns it) — this story only produces the `fit_wears` rows it reads from. Don't touch `components/wardrobe/*`. Don't add a confirmation sheet for either action — that pattern is reserved for destructive actions elsewhere in the app. Don't expose any UI for unmarking or editing a *past* day's wear entry — only today's. Don't add a favorite affordance to `FitsGridCell.tsx`/`app/(tabs)/fits.tsx` in this story — that's the deferred fast-follow.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Favorite, currently off | tap Favorite, `is_favorite=false` | Updates to `true`, heart fills solid, `fits` query cache invalidated | N/A |
| Favorite, currently on | tap Favorite, `is_favorite=true` | Updates to `false`, heart returns to outline | N/A |
| Favorite write fails | `update()` errors (no connection or unknown) | Heart state unchanged, error banner shown | Reported to Sentry unless `no_connection` |
| Wear today, not yet logged | tap "Wear today", no `fit_wears` row for (fit, today) | Row inserted, button reflects an already-worn-today state, `wornFitIds` cache invalidated | N/A |
| Wear today, already logged today | tap "Wear today" again same day | Row for today deleted (undo), button returns to not-worn-today state, `wornFitIds` cache invalidated | N/A |
| Wear today write fails | `insert()` errors (no connection or unknown) | Error banner shown, no state change | Reported to Sentry unless `no_connection` |
| Wear-today undo fails | `delete()` errors (no connection or unknown) | Error banner shown, button stays in worn-today state | Reported to Sentry unless `no_connection` |

</frozen-after-approval>

## Code Map

- `supabase/migrations/0009_fit_wears_undo.sql` (new) -- adds `fit_wears_delete_own` policy (`for delete using (user_id = (select auth.uid()))`), mirroring `fits_update_own`'s shape in `0004_fits.sql`.
- `supabase/tests/rls.test.ts` -- extend the existing `fit_wears` cross-user-isolation block to also cover DELETE (a user can't delete another user's wear row).
- `lib/fits/toggleFavorite.ts` (new) -- `toggleFitFavorite(fitId, nextValue)`: `supabase.from('fits').update({ is_favorite: nextValue }).eq('id', fitId)`, same error-classification shape as `deleteFit.ts` (`no_connection` vs unknown `FitError`). Uses the existing `fits_update_own` RLS policy — no migration needed.
- `lib/fits/markFitWorn.ts` (new) -- `markFitWornToday(userId, fitId)`: inserts `{ id: Crypto.randomUUID(), user_id: userId, fit_id: fitId, worn_on: <today, local calendar date> }` into `fit_wears`. `unmarkFitWornToday(userId, fitId)`: deletes the row matching `(user_id, fit_id, worn_on: today)` only -- never accepts an arbitrary date. Uses `Crypto.randomUUID()` (`expo-crypto`), same client-generated-id convention as `stores/fitBuilder.ts`. Same error-classification shape as `toggleFavorite.ts`.
- `lib/fits/wornFitIds.ts` -- extend with a way to check whether *today's* row already exists for a given fit (not just "ever worn"), so the detail screen can render the already-worn-today state and decide insert-vs-delete on tap.
- `components/ui/icons/HeartIcon.tsx` (new) -- `{ size, color, filled }`; outline (`fill="none"`, `stroke={color}`) vs filled (`fill={color}`), same viewBox/stroke-width family as `PencilIcon`/`CheckIcon`. (Reused as-is by the deferred grid-cell fast-follow — building it correctly now avoids rework there.)
- `app/fit/[id].tsx` -- add Favorite and Wear-today `Pressable`s to the existing icon action row (same pattern as Edit/Delete: `ACTION_TOUCH_TARGET`, `hitSlop={8}`, `active:opacity-60`, disabled while busy); wire the lib functions; invalidate `['fits', userId]` and `['wornFitIds', userId]` on success; reuse `ConnectionErrorNotice`/`reportUnknownError` for failures, same as `handleDelete`.
- `supabase/migrations/0010_fits_favorite_no_reorder.sql` (new, added during review) -- scopes `fits_set_updated_at`'s firing condition via a `WHEN` clause so an `is_favorite`-only update doesn't bump `updated_at` (My Fits sorts by `updated_at desc`, so it would otherwise reorder the grid on every favorite tap). `set_updated_at()` itself is shared by `profiles`/`wardrobe_items`/`fits` -- the fix is scoped to `fits`'s own trigger definition, not the shared function.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/0009_fit_wears_undo.sql` -- add `fit_wears_delete_own` policy -- unblocks today-only undo
- [x] `supabase/tests/rls.test.ts` (extend) -- test first -- DELETE cross-user isolation for `fit_wears`
- [x] `__tests__/toggleFavorite.test.ts` + `lib/fits/toggleFavorite.ts` -- test first -- success + no-connection + unknown-error cases
- [x] `__tests__/markFitWorn.test.ts` + `lib/fits/markFitWorn.ts` -- test first -- mark success, unmark success, both error paths for each
- [x] `__tests__/wornFitIds.test.ts` (extend) + `lib/fits/wornFitIds.ts` -- test first -- today-worn lookup
- [x] `components/ui/icons/HeartIcon.tsx` -- outline/filled heart, matches existing icon family
- [x] `__tests__/fitDetail.test.tsx` (extend) -- test first -- favorite toggle both directions, wear-today mark/unmark, already-worn-today state, all error paths
- [x] `app/fit/[id].tsx` -- wire Favorite/Wear-today actions per Code Map
- [x] `supabase/migrations/0010_fits_favorite_no_reorder.sql` + `supabase/tests/rls.test.ts` (extend) -- review fix -- stop favoriting from reordering the My Fits grid
- [x] `lib/fits/markFitWorn.ts`, `__tests__/markFitWorn.test.ts` (extend) -- review fix -- treat a unique-constraint violation as an already-worn no-op
- [x] `app/fit/[id].tsx` -- review fix -- clear optimistic overrides once invalidation lands; dim icons and disable Delete while a favorite/wear write is in flight
- [x] `__tests__/fitDetail.test.tsx` (extend) -- review fix -- busy-guard no-op tests for both actions
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- review fix -- annotate Story 4.1's now-resolved deferred item

**Acceptance Criteria:**
- Given a Fit's detail, when I tap Favorite, then `is_favorite` toggles and it appears/disappears from the Favorites filter accordingly.
- Given a Fit's detail, when I tap "Wear today", then a row is written to `fit_wears` for today's date.
- Given a Fit has at least one wear row, then it appears under the Worn filter.

## Implementation Notes

- `todayLocalDate()` was extracted to a new shared `lib/fits/localDate.ts` (not in the original Code Map) instead of duplicating it in both `markFitWorn.ts` (write) and `wornFitIds.ts` (read) -- both need the exact same UTC-boundary-sensitive logic, and having it live twice risked the two silently drifting. Tested indirectly via `markFitWorn.test.ts`/`wornFitIds.test.ts` using `jest.useFakeTimers().setSystemTime(...)` at 11:30pm local, which would fail if either caller used `toISOString()`'s UTC date instead.
- Favorite/Wear-today use local optimistic state (`favoriteOverride`/`wornTodayOverride`, `null` = "trust the fetched value") rather than waiting for query invalidation to reflect the change -- DESIGN.md/EXPERIENCE.md both require an immediate visual flip with no confirmation step. Reverts to the prior value on write failure.
- The optimistic-override reset (new Fit `id` navigated to) is done during render (`if (id !== overrideResetForId) { setOverrideResetForId(id); ... }`), not in a `useEffect`, per React's documented "adjust state when a prop changes" pattern -- an effect-based version was rejected by this repo's lint config (`react-hooks/set-state-in-effect`: "Calling setState synchronously within an effect can trigger cascading renders").
- Wear-today's already-worn-today state swaps the icon to the existing `CheckIcon` (rather than adding a `filled` variant to the shared `CalendarIcon`, which is also used by the tab bar and out of this story's scope) -- not specified by DESIGN.md, which only defines fill-vs-outline for the heart; this is a same-family, same-weight icon-swap consistent with that document's broader "state via weight/fill, never color" rule.
- All `npm run test`/`typecheck`/`lint` verification below was re-run capturing each command's own exit code directly (`echo EXIT:$?` immediately after, no pipe to `tail`), per Story 4.1's retro note about a prior story's masked verification failures.
- Matrix Test Audit caught a gap on first pass: "Wear-today undo fails" was covered at the lib level (`markFitWorn.test.ts`'s `unmarkFitWornToday` error cases) but not at the UI-revert level. Added two `fitDetail.test.tsx` cases asserting the button reverts to the worn-today state and the right error message shows when `unmarkFitWornToday` rejects.
- Final verification, genuinely re-checked: `npm run test` (386 passed, 11 skipped -- the skipped suite is the Supabase RLS/DB-trigger integration tests, which need live credentials, same as every prior story), `npm run typecheck` (clean), `npm run lint` (clean, after fixing one `react-hooks/set-state-in-effect` violation from the first draft of the override-reset logic).
- Post-review: fixing the stale-optimistic-override bug (clearing the override once invalidation lands, instead of leaving it pinned forever) broke two existing assertions that checked the button's label *after* the full write+invalidate chain resolved -- since `useTodayWornFitIds` is statically mocked in this suite, clearing the override exposed the mock's frozen (never-updated) value instead of the real post-refetch truth a live query would provide. Fixed by asserting the immediate optimistic state instead (same pattern the sibling Favorite "flips immediately" test already used), which is what those tests were actually meant to verify.

## Spec Change Log

## Review Triage Log

All three review layers (Blind Hunter, Edge Case Hunter, Verification Gap) ran in parallel against the diff at baseline `8e2a4895a8eb059e297a1f1d3be752c509ff133b`. Grouped below by root cause.

- **Favoriting a Fit bumps `fits.updated_at` via the pre-existing, shared `set_updated_at()` trigger, and the My Fits grid sorts by `updated_at desc` (`listFits.ts`), so tapping Favorite silently reorders the whole grid** (edge-case-hunter). Verdict: `medium` — real, user-visible, and not addressed anywhere in this spec's I/O matrix or Boundaries; this story is the first to UPDATE a visible-in-grid `fits` row without also changing something the user expects to reorder for (unlike an edit, which legitimately should resurface). Verified `set_updated_at()` is shared across `profiles`/`wardrobe_items`/`fits` (`grep` confirms), so the fix must live in the `fits`-specific trigger's own `WHEN` clause, not the shared function. Route: `patch` — trivial, well-scoped Postgres idiom, touches only `fits`'s own trigger definition.
- **`favoriteOverride`/`wornTodayOverride` are set on optimistic flip but never cleared back to `null` after a successful write + cache invalidation, so the UI permanently trusts the local value and never reconciles with whatever the server/refetch actually returns for the rest of this screen instance's life** (blind-hunter, edge-case-hunter — both independently). Verdict: `medium` — breaks this codebase's own stated "single source of truth" convention (`app/fit/[id].tsx`'s own comment). Route: `patch` — await the invalidation, then clear the override once the refetch has actually landed.
- **`markFitWornToday` has no handling for a Postgres unique-violation (23505) on `fit_wears`'s `(user_id, fit_id, worn_on)` constraint, so a duplicate insert (e.g. two open instances of this screen) reports as an unknown error and wrongly reverts the UI to "not worn today" even though the row genuinely already exists** (blind-hunter, edge-case-hunter — both independently, edge-case-hunter traced it to the exact constraint). Verdict: `medium` — wrong-direction revert plus spurious Sentry noise for what is really an idempotent "already worn" case; the constraint's own migration comment explicitly anticipated this scenario. Route: `patch` — catch code `23505` and treat as an already-worn no-op, not an error.
- **`deferred-work.md`'s Story 4.1 entry ("`fit_wears` has no UPDATE or DELETE policy...") is left unmarked even though this story's own spec says "This closes the deferred item from Story 4.1's review"** (blind-hunter). Verdict: `low` — real documentation drift that could cause a future retro to re-investigate an already-closed gap. Route: `patch` — annotate the existing entry as resolved (append-only, doesn't rewrite the original text).
- **Favorite/Wear-today icons only dim for `deleting`, not their own `favoriteBusy`/`wearBusy`, so a disabled-but-in-flight button still renders in full "active" color** (blind-hunter). Verdict: `low` — narrow timing window, purely a missed visual affordance inconsistent with the stated intent of matching Edit/Delete's disabled convention. Route: `patch` — include the action's own busy flag in its icon's color condition.
- **No test exercises the busy-guards themselves — nothing asserts a second tap mid-write is a no-op** (blind-hunter). Verdict: `low` — the guard is simple today but is the only thing preventing a duplicate write, and a future refactor could silently drop it with no test to catch that. Route: `patch` — add one test per action.
- **Delete's `disabled` prop checks only `deleting`, not `favoriteBusy`/`wearBusy`, so deleting the Fit while a favorite/wear write is in flight lets that write's callback call `setState` after the screen unmounts and fires a write against a Fit the user just deleted** (edge-case-hunter). Verdict: `low` — narrow window (a single network round-trip), harmless outcome (console warning + an orphaned wear/favorite write on a soft-deleted row), but the fix is a direct one-line correction. Route: `patch`.
- **`toggleFitFavorite`/`unmarkFitWornToday` don't check affected row count, so a write that silently matched zero rows (RLS filtered it out, or the row was already gone) looks identical to success** (blind-hunter). Verdict: `low` — real in principle, but reachability from this screen is contrived (the Fit is already known-owned and known-loaded for this exact user before either button can render), and matches this codebase's existing `deleteFit.ts` convention, which has the same shape. Route: reject (low, everyday-unlikely, fix adds non-trivial complexity).
- **Favorite and Wear-today share one `errorMessage` banner slot; firing both in quick succession lets whichever error resolves second silently overwrite the first, so the user could miss one of two independent failures** (blind-hunter). Verdict: `low` — each override still independently reverts correctly; only the explanatory banner text can be overwritten. Route: reject (low, fix requires a multi-slot error UI, more than a direct correction).
- **`getTodayWornFitIds` issues a second, separate query against `fit_wears` alongside the pre-existing `getWornFitIds`, instead of deriving "today" from one shared fetch** (blind-hunter). Verdict: `low` — real simplification opportunity, but `fit_wears` is small and per-user-indexed; no meaningful cost. Route: reject (low, fix is a non-trivial cross-hook refactor, more than a direct correction).
- **The new `fit_wears_delete_own` policy is scoped only by `user_id`, not by date — the "only today's row" guarantee is purely client-side** (blind-hunter). Verdict: `false` — this is not an undisclosed defect; it's an explicitly documented, deliberate tradeoff already recorded in this spec's own frozen Intent block ("a client-side UX guarantee ... not something this policy enforces at the database level"), decided during planning with the same reasoning the reviewer independently arrived at.
- **The worn-today icon swap to `CheckIcon` (state-via-icon-swap) isn't documented in DESIGN.md, which only defines fill-vs-outline for the heart** (blind-hunter, this story's own Implementation Notes flagged it too). Verdict: `low` — real design-system documentation gap, but the fix means editing a planning artifact (DESIGN.md), not this story's application code. Route: `defer`.
- **The new `fit_wears_delete_own` RLS policy is verified only by a test that's skipped whenever live Supabase credentials aren't configured** (verification-gap, pre-verified per that layer's own evidence rules). Verdict: filed as `defer` by the layer itself — same pre-existing gap every prior story's own RLS additions have shipped under; closing it means wiring live/local Supabase credentials into the normal CI/test path project-wide, bigger than this one policy. Route: `defer`.

## Design Notes

Icon placement follows Story 4.1's own Mobbin references (Whering, Doji) for a chrome-free detail-screen action row — Favorite and Wear-today join Edit/Delete as same-weight icons, no new visual hierarchy. Heart fill state is fully specified by DESIGN.md (`favorite-indicator`: outline `ink-secondary` inactive, filled `ink-primary` active) — this story implements that spec, it doesn't design a new one.

## Verification

**Commands:**
- `npm run test` -- expected: all new and extended `__tests__/*` files pass
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

**Manual checks (if no CLI):**
- Run the app (`run` skill): open a Fit's detail, tap Favorite, confirm the heart fills and the Fit now shows under My Fits' Favorites filter (and disappears when un-favorited).
- Tap "Wear today", confirm the button reflects the worn state and the Fit now shows under the Worn filter; tap again same day and confirm the row is removed with no error.
