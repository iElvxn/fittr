---
title: 'Story 4.1: Browse and Filter My Fits'
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '3bbe0e88d56dc703b680dfcdb6be81a69c0cc4dc'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** My Fits (`app/(tabs)/fits.tsx`) shows a flat, unfiltered grid with a bare spinner while loading, and the Fit detail screen (`app/fit/[id].tsx`) has no item list and puts a shadow on the collage photo, contradicting DESIGN.md's "photography never gets a shadow" rule. Neither screen currently reflects the minimalist, fashion-editorial visual language DESIGN.md already specifies.

**Approach:** Add All/Favorites/Worn filter chips and a skeleton loading state to the Fits grid; add an item list to the Fit detail screen; restyle both surfaces to actually honor DESIGN.md (remove the collage shadow, tighten the grid cell's caption treatment) using Mobbin references (Whering, Doji, Zalando) for layout cues while staying inside the existing monochrome/Cormorant-Montserrat system — no new colors or fonts. Write unit tests before implementation for each changed file.

## Boundaries & Constraints

**Always:** Filter chips are single-select (default "All"), same interaction model as `components/wardrobe/CategoryFilterChips.tsx`. Favorite/Worn state is read-only here — no favorite toggle or "mark worn" UI (Story 4.2). Detail-screen actions stay exactly Edit/Delete (already built); no placeholders for Favorite/Wear/Plan/Share, matching the existing scoping comment in `app/fit/[id].tsx`. All new UI uses only tokens already in `lib/theme/colors.ts`/`tailwind.config.js` — no new hex values.

**Never:** Don't touch `components/wardrobe/*` (wardrobe grid/filter code stays untouched — build fits-scoped equivalents instead). Don't add a "mark worn" write path or streak logic (4.2/4.4). Don't widen `fit_wears` beyond `data-model.md`'s columns.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default view | Filter = All | Every non-deleted Fit shown, unchanged order | N/A |
| Favorites filter | Filter = Favorites, some `fits.is_favorite = true` | Only those Fits shown | N/A |
| Worn filter, nothing worn yet | Filter = Worn, `fit_wears` empty (pre-4.2) | Empty grid, filter-specific empty copy ("Nothing worn yet.") — not the all-Fits "Build your first Fit." message | N/A |
| Filter yields zero of many | Filter = Favorites/Worn, 0 matches, 1+ total Fits exist | Filter-specific empty copy, chips stay visible/selectable | N/A |
| Grid loading | Query in flight | Skeleton grid (not spinner), matches 2-col layout | N/A |
| Detail: mixed live/deleted items | Fit has both | Item list shows every placement; deleted-source rows muted with "Removed" label, same treatment as the canvas gap (Story 3.4) | N/A |
| Detail: item list fetch fails | `getFitItems` errors (no connection or unknown) | Cover/name/Edit/Delete still render normally (fail-open, matches existing `isEmptyFit` pattern); item list section just omitted | Reported to Sentry unless `no_connection` |

</frozen-after-approval>

## Code Map

- `supabase/migrations/0008_fit_wears.sql` -- new `fit_wears` table (`id`, `user_id`, `fit_id`, `worn_on` date, `created_at`) per `data-model.md`; RLS mirrors `0004_fits.sql` (`select_own`/`insert_own` on `user_id = auth.uid()`); index on `(user_id, fit_id)`. Nothing writes to it until Story 4.2 — this story only reads it, so the Worn filter is always empty for now, which is correct.
- `lib/fits/listFits.ts` -- add `is_favorite` to `FitRow` and the `select(...)` string.
- `lib/fits/wornFitIds.ts` (new) -- `useWornFitIds(userId)`: `useQuery` selecting distinct `fit_id` from `fit_wears` for the user, returns `Set<string>`. Mirrors `listFits.ts`'s query shape.
- `components/fits/FitsFilterChips.tsx` (new) -- All/Favorites/Worn, modeled on `components/wardrobe/CategoryFilterChips.tsx`'s fill-vs-outline selected state (don't generalize that component — keep fits/wardrobe filter chips separate per existing per-domain split).
- `components/fits/FitsGridSkeleton.tsx` (new) -- modeled on `components/wardrobe/WardrobeGridSkeleton.tsx`.
- `components/fits/FitsGridCell.tsx` -- restyle caption: move the name from a bottom-overlay pill on the photo to a plain caption below the image (closer to Zalando/Doji references), removing the overlay-on-photography treatment.
- `app/(tabs)/fits.tsx` -- add filter `useState`, render `FitsFilterChips`, filter `fits` client-side before rendering, swap `ActivityIndicator` loading branch for `FitsGridSkeleton`, add filter-aware empty copy.
- `lib/fits/getFitItems.ts` -- extend `.select(...)` to also embed `wardrobe_items(name, thumb_path)`; add `name: string | null` and `thumbPath: string` to `FitItemPlacementWithSource`.
- `components/fits/FitItemsList.tsx` (new) -- one row per placement: thumbnail (via `useThumbnailUrls`) + name/category; deleted-source rows muted, "Removed" label.
- `app/fit/[id].tsx` -- remove `COVER_SHADOW` (contradicts DESIGN.md), render `FitItemsList` below the meta row using the existing `fitItems` query result.

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/0008_fit_wears.sql` -- create table + RLS -- unblocks the Worn filter query
- [x] `__tests__/wornFitIds.test.ts` + `lib/fits/wornFitIds.ts` -- test first -- covers empty/non-empty/error cases
- [x] `__tests__/listFits.test.ts` (extend) -- assert `is_favorite` selected and passed through
- [x] `__tests__/fitsFilterChips.test.tsx` + `components/fits/FitsFilterChips.tsx` -- test first -- selection + a11y state
- [x] `__tests__/fits.test.tsx` (extend) -- test first -- filter switching, skeleton loading state, per-filter empty copy
- [x] `app/(tabs)/fits.tsx` -- wire filters + skeleton per Code Map
- [x] `components/fits/FitsGridSkeleton.tsx`, `components/fits/FitsGridCell.tsx` -- skeleton + caption restyle
- [x] `__tests__/getFitItems.test.ts` (extend) -- test first -- `name`/`thumbPath` join
- [x] `lib/fits/getFitItems.ts` -- extend join per Code Map
- [x] `__tests__/fitItemsList.test.tsx` + `components/fits/FitItemsList.tsx` -- test first -- mixed live/deleted rendering
- [x] `__tests__/fitDetail.test.tsx` (extend) -- test first -- item list renders, shadow removed, fetch-fail fails open
- [x] `app/fit/[id].tsx` -- integrate `FitItemsList`, drop `COVER_SHADOW`

**Acceptance Criteria:**
- Given saved Fits with a mix of favorited/unfavorited, when I open My Fits, then I see all of them in a 2-column grid with All/Favorites/Worn chips, defaulting to All.
- Given the Favorites chip selected, when the grid re-renders, then only `is_favorite = true` Fits show.
- Given I tap a Fit, when its detail screen opens, then I see the collage (no shadow), name, item list, and Edit/Delete only.

## Implementation Notes

- `lib/fits/wornFitIds.ts` and `lib/fits/listFits.ts` both split a plain, directly-testable async function (`getWornFitIds`, `getFits`) out from their `useQuery`-wrapping hook, same shape as `getFitItems.ts` — needed to unit-test the query without rendering React Query (a `renderHook`-based attempt at `listFits.ts` failed outright in this codebase's test setup; the plain-function split sidesteps it entirely and matches the established pattern).
- Added a `fit_wears` RLS cross-user-isolation block to `supabase/tests/rls.test.ts` (SELECT + INSERT only), mirroring the existing `fits` block. Not in the original Code Map but a direct extension of this story's own migration — every other RLS-bearing table in this schema has this coverage. Skipped like the rest of that file unless Supabase env vars are configured locally.
- `app/fit/[id].tsx`'s footer (name/meta/actions/item list) is a `ScrollView` with an explicit `flex: 1` inside a `flex: 2`/`flex: 1` split against the cover card — a `ScrollView` with no bounded height doesn't scroll in React Native, it just overflows past the screen, caught by the Edge Case Hunter review layer.
- **Process note, corrected during review:** every `npm run test`/`typecheck`/`lint` verification during initial implementation was run as `command | tail -N` in a shell without `pipefail`, so the reported "exit code 0" reflected `tail`, not the actual command — several real failures (a filter-logic bug, two crashing test suites, a broken `renderHook` usage, a stale fixture) shipped past "verification" undetected until the review layers caught them. All commands were re-run afterward capturing the command's own exit status directly (`PIPESTATUS[0]` / no pipe), and are now genuinely green.
- Grid cell caption restyle (`FitsGridCell.tsx`) and the Mobbin-informed layout direction are covered under Design Notes below; no behavioral test changes were needed for that piece since existing `fits.test.tsx` assertions (`getByText(name)`) are layout-agnostic.
- Final verification, genuinely re-checked: `npm run test` (355 passed, 9 skipped — the skipped suite is the Supabase RLS integration tests, which need live credentials), `npm run typecheck` (clean), `npm run lint` (clean).

## Spec Change Log

## Review Triage Log

All three review layers (Blind Hunter, Edge Case Hunter, Verification Gap) ran in parallel against the diff at baseline `3bbe0e88d56dc703b680dfcdb6be81a69c0cc4dc`. Several reviewers independently found the same root causes; grouped below by root cause with every contributing reviewer noted.

- **`filterEmptyMessage` ignored `filteredFits.length`, so the Favorites/Worn grid never rendered even with matches** (blind-hunter, edge-case-hunter — edge-case-hunter independently re-ran `narrows to favorited Fits` against the working tree and confirmed the failure). Verdict: `high` — confirmed by direct test execution, contradicts the spec's own AC #2. Route: patch. Fixed: `app/(tabs)/fits.tsx` now gates the empty message on `filter !== 'all' && filteredFits.length === 0`.
- **`useWornFitIds`'s `isError`/`error` were never read, so a Worn-status fetch failure is indistinguishable from "nothing worn" and never reaches Sentry** (blind-hunter, edge-case-hunter, verification-gap — all three independently). Verdict: `medium` — real observability gap, established `useFits`/`getFitItems` error-reporting convention not followed. Route: patch. Fixed: added `isError`/`error` destructuring, a `FitError`-aware Sentry report (fails open, doesn't block the grid), and a test.
- **Skeleton loading state only gated on `useFits`'s `isLoading`, not `useWornFitIds`'s, creating a race where an early Worn-filter interaction reads `wornFitIds` as `undefined` (`?? false`)** (blind-hunter, edge-case-hunter). Verdict: `low` — narrow timing window, not user-facing in practice since both queries fire together, but a real gap. Route: patch. Fixed: skeleton branch now also gates on `isWornLoading`; added a test.
- **`ScrollView` footer in `app/fit/[id].tsx` had no bounded height, so it wouldn't actually scroll — it would just let content overflow past the screen** (edge-case-hunter). Verdict: `high` — would silently defeat the diff's own stated purpose for a Fit with several items. Route: patch. Fixed: cover/footer now split `flex: 2`/`flex: 1`, with `flex: 1` on the `ScrollView` itself so it has a bounded frame to scroll within.
- **`FitItemsList` showed the category label twice (as the name fallback AND unconditionally in the meta line) for a nameless item** (blind-hunter). Verdict: `medium` — real visual bug, and made the reviewer's own `getByText('Shoes')` assertion ambiguous. Route: patch. Fixed: meta line now omits the category when it's already shown as the primary label.
- **`FitItemsList`'s thumbnail-`Image` branch (`useThumbnailUrls` keyed by `thumbPath`) had zero test coverage — every existing test left `thumbnailUrls` empty/non-matching** (verification-gap). Verdict: `medium`, pre-verified per that layer's evidence rules. Route: patch. Fixed: added a test asserting the resolved URL reaches the `Image`'s `source`.
- **`thumbPaths` recomputed on every `FitItemsList` render instead of memoized, unlike the sibling `coverPaths` in `fits.tsx`** (blind-hunter). Verdict: `low` — convention/perf inconsistency, not user-visible. Route: patch. Fixed: wrapped in `useMemo`.
- **`fit_wears` had no `unique (user_id, fit_id, worn_on)` constraint, so a future double-tap on "mark worn" (Story 4.2) could insert duplicate same-day rows that Story 4.4's streak logic would need to account for** (blind-hunter). Verdict: `medium` — data-integrity decision this story's own migration should settle. Route: patch. Fixed: added the constraint.
- **`fit_wears_user_id_fit_id_idx` leads with `user_id`, not `fit_id`, so it doesn't serve `fits`' `on delete cascade` into this table well** (blind-hunter). Verdict: `low` — the table is empty until Story 4.2, but a free, well-precedented fix (`0004_fits.sql`'s `fit_items_fit_id_idx` does the same for its own cascade). Route: patch. Fixed: added a dedicated `fit_wears_fit_id_idx`.
- **`thumbPath` typed as non-nullable `string` but silently defaulted to `''` for a missing source, unlike the sibling `name` field which defaults to `null`** (blind-hunter). Verdict: `low` — type-hygiene inconsistency, no behavioral bug (both are falsy). Route: patch. Fixed: `thumbPath` is now `string | null`, defaulting to `null`.
- **`fit_wears` has no UPDATE/DELETE policy at all, so a mis-tap on a future "mark worn" action could never be corrected** (blind-hunter). Verdict: `medium` if true, but the action it applies to (Story 4.2) doesn't exist yet. Route: defer — logged to `deferred-work.md`; this story only reads the table.
- **`app/fit/[id].tsx` still rendered a "Removed" item list underneath the zero-live-item empty state, contradicting its own "This Fit has no items left." message** (verification-gap, "Other findings"). Verdict: `low` — real but cosmetic redundancy, trivial guard consistent with the file's existing `isEmptyFit`-conditional pattern (it already hides the footer Edit button the same way). Route: patch. Fixed: item list now also checks `!isEmptyFit`.
- **`sprint-status.yaml`'s `4-1-browse-and-filter-my-fits: in-progress` looked inconsistent against this spec's `in-review` status and fully-checked task list** (blind-hunter). Verdict: `false` — not a code defect; sprint-status sync to the terminal status is this workflow's own next step, not something the diff itself should have done mid-review.

## Design Notes

Mobbin references pulled for this story: [Whering's outfit detail](https://mobbin.com/screens/1a5baca2-eb0b-4d9c-bdbd-77da43047dc2) (item list below a chrome-free collage card), [Doji's saved looks](https://mobbin.com/screens/2240b9c0-3351-42c1-9c10-4b6238d75cab) (full-bleed grid photography, minimal caption), [Zalando's saved outfits grid](https://mobbin.com/screens/8309d3e7-2985-49a0-b760-72a7e0e70dc3) (caption below image, not overlaid). Direction: keep DESIGN.md's existing monochrome/Cormorant-Montserrat system exactly as documented — the fix is making the app actually honor it (no shadow on photography, no overlay chrome on grid cells), not introducing a new visual language.

## Verification

**Commands:**
- `npm run test` -- expected: all new and extended `__tests__/*` files pass
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

**Manual checks (if no CLI):**
- Run the app (`run` skill), open My Fits: verify chip switching, skeleton on cold load, and that the grid cell caption sits below the image rather than overlaid on it.
- Open a Fit's detail screen: verify no shadow on the collage and the item list renders correctly for a Fit with a deleted-source item.
