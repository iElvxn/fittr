---
title: 'Story 6.6: Count Wears on the Server'
type: 'refactor'
created: '2026-09-27'
status: 'draft'
route: ''
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `getFitWearCounts` (`lib/fits/wornFitIds.ts:13`) downloads one row for every wear the user has ever logged and counts them on the phone. It runs on Home, My Fits and the Planner, and the download grows forever. Past PostgREST's `max_rows` (1000 by default) the response is cut off, so "Worn N×" undercounts and some worn Fits show "Saved" (`deferred-work.md`, Phase 2 review).

**Approach:** A Postgres view, `fit_wear_counts`, groups `fit_wears` by user and Fit and returns one row per Fit that has been worn, with its count. It enforces the caller's row-level security (`security_invoker = true`). `getFitWearCounts` reads the view, and its return type and callers stay the same.

## Boundaries & Constraints

**Always:**
- The view is created `with (security_invoker = true)`, so the `fit_wears` RLS policies apply to the caller. A plain view runs with its owner's rights and would return every user's counts.
- Access: `select` granted to `authenticated` only, revoked from `anon` and `public`.
- `getFitWearCounts` still returns `Map<fitId, count>`, with never-worn Fits absent. My Fits' Worn filter, the "Saved {date}" line and every "Worn N×" status read exactly as before.
- It keeps the `['wornFitIds', userId]` key, which `invalidateWearQueries` refreshes.
- The count is an integer (`count(*)::int`) so it arrives as a JSON number, not a string.
- The existing `fit_wears_user_id_fit_id_idx (user_id, fit_id)` serves the grouping. No new index.

**Never:** no RPC or security-definer function, no materialized view (it would go stale between wears), no change to `fit_wears` or its policies, and no client-side count fallback.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Worn Fits | A worn 3×, B 1× | `Map { A → 3, B → 1 }` | N/A |
| Never worn | no wears | empty Map; Worn filter empty | N/A |
| Other users' wears | user 2 has wears | invisible to user 1 through the view | N/A |
| Anonymous caller | `anon` key, no session | permission denied | N/A |
| Wear or undo | toggle on any screen | counts refresh through `invalidateWearQueries` | N/A |
| Offline | no connection | same `FitError('no_connection')` as today | existing handling |

</frozen-after-approval>

## Code Map

- `supabase/migrations/0016_fit_wear_counts_view.sql` (new; `0014` is Story 6.1's and `0015` Story 6.2's, so renumber to the next free number if they land in a different order) -- `create view public.fit_wear_counts with (security_invoker = true) as select user_id, fit_id, count(*)::int as wear_count from public.fit_wears group by user_id, fit_id;` with grants/revokes and a comment on why the view must enforce the caller's RLS.
- `lib/fits/wornFitIds.ts:13-45` -- `getFitWearCounts` selects `fit_id, wear_count` from the view with `.eq('user_id', userId)`, so RLS and the explicit filter agree and the index is used. `useFitWearCounts` is unchanged.
- `supabase/tests/rls.test.ts` -- add cross-user and anonymous cases for the view, in the file's existing style.
- `__tests__/wornFitIds.test.ts` -- the `getFitWearCounts` tests mock the new select.

## Tasks & Acceptance

**Execution:**
- [ ] `__tests__/wornFitIds.test.ts`, `supabase/tests/rls.test.ts` -- the matrix, including isolation and anonymous denial.
- [ ] `supabase/migrations/0016_fit_wear_counts_view.sql` -- the view. Apply it to the CI Supabase project before the RLS suite runs.
- [ ] `lib/fits/wornFitIds.ts` -- read the view.

**Acceptance Criteria:**
- Given `supabase db reset` and the RLS suite against a local or CI project, when run, then the view returns only the caller's rows and denies `anon`.
- Given a user with N wears across M Fits, when My Fits loads, then the counts response has M rows, not N.

## Design Notes

- `security_invoker` on views needs Postgres 15 or later. Supabase projects default to 15+, but confirm the CI and production projects' version before building (Dashboard → Settings → Infrastructure).
- PostgREST aggregate functions (`select('fit_id, count()')`) would avoid a view, but they are off by default on Supabase and would need a project-wide setting change. The view keeps it in a migration.
- Out of scope: `getWearDates` (`lib/fits/wearStreak.ts:12`) also downloads every wear's `worn_on`. It is ordered newest-first, so a cut-off response drops the oldest history rather than the days the streak counts; it stays as is and is logged in `deferred-work.md`.

## Verification

**Commands:**
- `npm run test -- --maxWorkers=2` -- expected: app suites pass.
- `npm test -- --selectProjects supabase-integration` (with CI Supabase credentials) -- expected: RLS suite passes.
- `npm run typecheck` / `npm run lint` -- expected: clean.
